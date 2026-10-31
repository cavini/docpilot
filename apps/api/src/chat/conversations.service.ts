import { Inject, Injectable } from '@nestjs/common';
import { asc, desc, eq, lt, sql } from 'drizzle-orm';

import { NotFoundError } from '../common/errors/index.js';
import { type Database } from '../db/database.type.js';
import { DATABASE } from '../db/db.tokens.js';
import {
  type ConversationRow,
  type MessageRow,
  type StoredCitation,
  conversations,
  messages,
} from '../db/schema/index.js';

/** Default page size for the conversation list. */
const DEFAULT_PAGE_SIZE = 30;

/** Ceiling on the page size, whatever a caller asks for. */
const MAX_PAGE_SIZE = 100;

/** How long a derived conversation title may be. */
const MAX_TITLE_LENGTH = 80;

/** One page of conversations. */
export interface ConversationPage {
  items: ConversationRow[];
  nextCursor: string | null;
}

/** A conversation with its turns, oldest first. */
export interface ConversationWithMessages {
  conversation: ConversationRow;
  messages: MessageRow[];
}

/** What to record for an assistant turn. */
export interface AssistantTurn {
  content: string;
  outcome: 'complete' | 'stopped' | 'failed';
  citations: StoredCitation[];
  inputTokens: number;
  outputTokens: number;
}

/**
 * Derives a conversation's title from its first question.
 *
 * Truncated at a word boundary where one is near the limit, because cutting
 * mid-word reads as a rendering bug rather than as a deliberate shortening.
 *
 * @param question The first question asked.
 * @returns A short title.
 */
export function titleFrom(question: string): string {
  const collapsed = question.trim().replace(/\s+/gu, ' ');

  if (collapsed.length <= MAX_TITLE_LENGTH) {
    return collapsed;
  }

  const cut = collapsed.slice(0, MAX_TITLE_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');

  return `${lastSpace > MAX_TITLE_LENGTH / 2 ? cut.slice(0, lastSpace) : cut}…`;
}

/**
 * Stores conversations and their turns.
 *
 * Separate from the service that streams answers, because persistence and
 * generation fail for entirely different reasons and are worth testing apart:
 * this one needs a database and no model, and the streaming service needs a
 * model and no real database.
 */
@Injectable()
export class ConversationsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Lists conversations, most recently used first.
   *
   * Sorted on `updatedAt`, not `createdAt`: a conversation someone returned to
   * this morning belongs above one they started last week and abandoned.
   *
   * @param options Page size, and the cursor from a previous page.
   */
  async list(options: { limit?: number; cursor?: string } = {}): Promise<ConversationPage> {
    const limit = Math.min(options.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const cursor = options.cursor === undefined ? undefined : new Date(options.cursor);

    const rows = await this.db
      .select()
      .from(conversations)
      .where(cursor ? lt(conversations.updatedAt, cursor) : undefined)
      .orderBy(desc(conversations.updatedAt))
      // One extra row answers "is there another page" without a count query.
      .limit(limit + 1);

    const items = rows.slice(0, limit);

    return {
      items,
      nextCursor: rows.length > limit ? (items.at(-1)?.updatedAt.toISOString() ?? null) : null,
    };
  }

  /**
   * Reads a conversation and its turns, oldest first.
   *
   * @throws {NotFoundError} If it does not exist.
   */
  async get(id: string): Promise<ConversationWithMessages> {
    const [conversation] = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));

    if (!conversation) {
      throw new NotFoundError('conversation', id);
    }

    const turns = await this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.ordinal));

    return { conversation, messages: turns };
  }

  /** Reads a conversation's turns without its row, for building a prompt. */
  async turnsOf(id: string): Promise<MessageRow[]> {
    return this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.ordinal));
  }

  /**
   * Starts a conversation, or confirms an existing one exists.
   *
   * @param id An existing conversation to continue, if any.
   * @param question The question, used as the title when starting one.
   * @returns The conversation to append to.
   * @throws {NotFoundError} If an id was given and does not exist.
   */
  async open(id: string | undefined, question: string): Promise<ConversationRow> {
    if (id !== undefined) {
      const [existing] = await this.db.select().from(conversations).where(eq(conversations.id, id));

      if (!existing) {
        throw new NotFoundError('conversation', id);
      }

      return existing;
    }

    const [created] = await this.db
      .insert(conversations)
      .values({ title: titleFrom(question) })
      .returning();

    if (!created) {
      throw new Error('the conversation could not be created');
    }

    return created;
  }

  /**
   * Appends a question and the answer it produced, as one transaction.
   *
   * Both turns together, because a question stored without its answer leaves a
   * conversation that resumes mid-air, and an answer stored without its
   * question is worse. The ordinal is computed inside the transaction, so two
   * concurrent turns cannot land on the same position.
   *
   * The conversation's `updatedAt` is touched here rather than by a trigger,
   * so the list's ordering follows from the same transaction that made the
   * change.
   *
   * @param conversationId Which conversation to append to.
   * @param question The question asked.
   * @param answer The assistant turn, including how it ended.
   * @returns The stored assistant message.
   */
  async appendTurn(
    conversationId: string,
    question: string,
    answer: AssistantTurn,
  ): Promise<MessageRow> {
    return this.db.transaction(async (tx) => {
      const [{ next } = { next: 0 }] = await tx
        .select({ next: sql<number>`coalesce(max(${messages.ordinal}), -1) + 1` })
        .from(messages)
        .where(eq(messages.conversationId, conversationId));

      await tx.insert(messages).values({
        conversationId,
        role: 'user',
        content: question,
        ordinal: next,
      });

      const [stored] = await tx
        .insert(messages)
        .values({
          conversationId,
          role: 'assistant',
          content: answer.content,
          ordinal: next + 1,
          outcome: answer.outcome,
          citations: answer.citations,
          inputTokens: answer.inputTokens,
          outputTokens: answer.outputTokens,
        })
        .returning();

      await tx
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));

      if (!stored) {
        throw new Error('the assistant turn could not be stored');
      }

      return stored;
    });
  }

  /**
   * Deletes a conversation and its turns.
   *
   * @throws {NotFoundError} If it does not exist.
   */
  async remove(id: string): Promise<void> {
    const deleted = await this.db
      .delete(conversations)
      .where(eq(conversations.id, id))
      .returning({ id: conversations.id });

    if (deleted.length === 0) {
      throw new NotFoundError('conversation', id);
    }
  }
}
