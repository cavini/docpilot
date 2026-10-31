import { Inject, Injectable } from '@nestjs/common';
import {
  type ToolSet,
  type UIMessageChunk,
  createUIMessageStream,
  stepCountIs,
  streamText,
  toUIMessageStream,
} from 'ai';
import { PinoLogger } from 'nestjs-pino';

import { CHAT_MODEL_FACTORY, type ChatModelFactory } from '../chat/chat.tokens.js';
import { ConversationsService } from '../chat/conversations.service.js';
import { buildHistory, renderHistory } from '../chat/history.js';
import { STREAM_PARTS } from '../chat/stream-parts.js';
import { InvalidRequestError } from '../common/errors/index.js';
import { type Env } from '../config/env.schema.js';
import { ENV } from '../config/env.tokens.js';
import { type Database } from '../db/database.type.js';
import { DATABASE } from '../db/db.tokens.js';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service.js';
import { CANNED_MOCK_AGENT_SCRIPT, UsageService } from '../llm/index.js';
import { RetrievalService } from '../retrieval/index.js';
import { AGENT_SYSTEM_PROMPT, STEP_LIMIT_NOTICE } from './agent.prompt.js';
import {
  createExtractStructuredTool,
  createSearchDocsTool,
  createSummarizeDocumentTool,
  createTicketTool,
} from './tools/index.js';

/**
 * What a finished turn needs to be stored.
 *
 * Held as the promises `streamText` exposes rather than as the result itself,
 * which is generic over the tool set and loses its type when stored.
 */
interface PendingTurn {
  text: PromiseLike<string>;
  usage: PromiseLike<{ inputTokens?: number | undefined; outputTokens?: number | undefined }>;
  steps: PromiseLike<readonly unknown[]>;
  finishReason: PromiseLike<string>;
  startedAt: number;
}

/** The one tool that writes, and so the one that needs approval. */
export const APPROVAL_REQUIRED_TOOL = 'create_ticket';

/** What to ask the agent. */
export interface AgentOptions {
  question: string;
  conversationId?: string;
  documentIds?: string[];
  requestId?: string;
  signal?: AbortSignal;
}

/**
 * Answers questions by choosing tools, in a bounded loop.
 *
 * The same shape as the chat service — retrieve, ground, stream, persist —
 * with the model deciding *how* to retrieve rather than being handed one fixed
 * search. Three things make that safe enough to ship:
 *
 * - **A step limit.** A model that keeps calling tools costs money on every
 *   step and would otherwise run until the request times out.
 * - **Approval before anything irreversible.** The loop does not execute
 *   `create_ticket` at all until the reader has answered.
 * - **Tool errors come back as data.** A tool that fails is something the
 *   model can act on; an exception ends the turn with nothing.
 */
@Injectable()
export class AgentService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(DATABASE) private readonly db: Database,
    private readonly retrieval: RetrievalService,
    private readonly conversations: ConversationsService,
    private readonly usage: UsageService,
    private readonly flags: FeatureFlagsService,
    private readonly logger: PinoLogger,
    @Inject(CHAT_MODEL_FACTORY) private readonly chatModel: ChatModelFactory,
  ) {
    this.logger.setContext(AgentService.name);
  }

  /**
   * Builds the tools for one turn.
   *
   * Built per turn rather than once, because two of them need the
   * conversation they are running in — `create_ticket` records which
   * conversation proposed a ticket, and that is the audit trail.
   *
   * With `FF_AGENT_TOOLS` off this returns nothing, and the endpoint answers
   * exactly like `/chat`.
   *
   * @param conversationId The conversation the turn belongs to.
   * @returns The tools the model may call.
   */
  private toolsFor(conversationId: string | null): ToolSet {
    if (!this.flags.isEnabled('agentTools')) {
      return {};
    }

    return {
      search_docs: createSearchDocsTool(this.retrieval, this.env),
      summarize_document: createSummarizeDocumentTool(
        this.db,
        this.chatModel,
        this.usage,
        this.env,
      ),
      extract_structured: createExtractStructuredTool(
        this.retrieval,
        this.chatModel,
        this.usage,
        this.env,
      ),
      [APPROVAL_REQUIRED_TOOL]: createTicketTool(this.db, conversationId),
    };
  }

  /**
   * Streams an answer, calling tools along the way.
   *
   * Validation and the conversation lookup happen before the stream opens, so
   * those failures are real status codes rather than error parts inside a 200.
   *
   * @param options The question, the conversation, and optional filters.
   * @returns A UI message stream for the caller to pipe to the response.
   * @throws {InvalidRequestError} If the question is empty or too long.
   * @throws {NotFoundError} If the conversation does not exist.
   */
  async stream(options: AgentOptions): Promise<ReadableStream<UIMessageChunk>> {
    const question = options.question.trim();

    if (question.length === 0) {
      throw new InvalidRequestError('The question is empty.');
    }

    if (question.length > this.env.MAX_QUESTION_LENGTH) {
      throw new InvalidRequestError(
        `The question is longer than the ${String(this.env.MAX_QUESTION_LENGTH)} character limit.`,
      );
    }

    const conversation = await this.conversations.open(options.conversationId, question);
    const previous = await this.conversations.turnsOf(conversation.id);
    const tools = this.toolsFor(conversation.id);

    /**
     * What `onEnd` needs, captured as the promises the result exposes.
     *
     * The pieces rather than the result object, because `streamText`'s return
     * type is generic over the tool set and storing it in a `let` loses that
     * — these four are concrete.
     */
    let pending: PendingTurn | undefined;

    return createUIMessageStream({
      execute: ({ writer }) => {
        // Before the data part, so it belongs to this message rather than to
        // one of its own.
        writer.write({ type: 'start' });
        writer.write({
          type: STREAM_PARTS.conversation,
          data: { conversationId: conversation.id },
        });

        const history = renderHistory(buildHistory(previous));
        // The mock provider answers directly unless it is scripted otherwise,
        // which would make /agent look identical to /chat and hide the one
        // thing it adds. Scripted to search once and then answer, so the tool
        // step is visible without a key; only the decision to search is fake.
        const { model } = this.chatModel(
          Object.keys(tools).length > 0 ? CANNED_MOCK_AGENT_SCRIPT : undefined,
        );
        const startedAt = Date.now();

        const result = streamText({
          model,
          tools,
          instructions: AGENT_SYSTEM_PROMPT,
          prompt: history === '' ? question : `${history}\n\nQuestion: ${question}`,
          maxOutputTokens: this.env.MAX_OUTPUT_TOKENS,
          // The bound that stops a confused model running until the request
          // times out.
          stopWhen: stepCountIs(this.env.AGENT_MAX_STEPS),
          // Approval at the call level rather than on the tool, which the SDK
          // has deprecated. The loop will not execute this tool until the
          // client answers, which is what makes the guarantee the loop's
          // rather than the tool's.
          ...(APPROVAL_REQUIRED_TOOL in tools
            ? { toolApproval: { [APPROVAL_REQUIRED_TOOL]: 'user-approval' as const } }
            : {}),
          ...(options.signal === undefined ? {} : { abortSignal: options.signal }),
        });

        pending = {
          text: result.text,
          usage: result.usage,
          steps: result.steps,
          finishReason: result.finishReason,
          startedAt,
        };

        writer.merge(
          toUIMessageStream({
            stream: result.stream,
            tools,
            sendStart: false,
            onError: (error: unknown) => {
              this.logger.warn(
                { err: error, conversationId: conversation.id },
                'agent stream failed',
              );

              return 'The answer could not be completed.';
            },
          }),
        );
      },
      // Runs only once every merged stream has drained, which is what makes
      // the finished text readable here without deadlocking.
      onEnd: async () => {
        if (pending !== undefined) {
          await this.persist(conversation.id, question, pending, options.requestId);
        }
      },
      onError: (error: unknown) => {
        this.logger.error({ err: error }, 'agent stream aborted');

        return 'The answer could not be completed.';
      },
    });
  }

  /** Stores the turn once the loop has ended, however it ended. */
  private async persist(
    conversationId: string,
    question: string,
    pending: PendingTurn,
    requestId?: string,
  ): Promise<void> {
    let text = '';
    let outcome: 'complete' | 'stopped' | 'failed' = 'complete';
    let inputTokens = 0;
    let outputTokens = 0;
    let steps = 0;

    const { provider, modelId } = this.chatModel();

    try {
      text = await pending.text;
      const usage = await pending.usage;
      inputTokens = usage.inputTokens ?? 0;
      outputTokens = usage.outputTokens ?? 0;
      steps = (await pending.steps).length;

      const reason = await pending.finishReason;

      if (reason !== 'stop' && reason !== 'length') {
        outcome = reason === 'error' ? 'failed' : 'stopped';
      }
    } catch {
      outcome = 'failed';
    }

    // A loop that used every step without answering leaves the reader an empty
    // bubble, which reads as the product being broken rather than as the agent
    // giving up.
    if (text.trim() === '' && steps >= this.env.AGENT_MAX_STEPS) {
      text = STEP_LIMIT_NOTICE;
      outcome = 'stopped';
    }

    await this.usage.record({
      operation: 'agent',
      provider,
      model: modelId,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - pending.startedAt,
      ...(requestId === undefined ? {} : { requestId }),
    });

    await this.conversations.appendTurn(conversationId, question, {
      content: text,
      outcome,
      citations: [],
      inputTokens,
      outputTokens,
    });

    this.logger.info(
      { conversationId, outcome, steps, inputTokens, outputTokens },
      'agent turn stored',
    );
  }
}
