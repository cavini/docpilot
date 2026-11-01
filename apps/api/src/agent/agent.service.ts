import { Inject, Injectable } from '@nestjs/common';
import {
  type ToolSet,
  type UIMessage,
  type UIMessageChunk,
  convertToModelMessages,
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
import { BudgetService } from '../budget/index.js';
import { type Env } from '../config/env.schema.js';
import { ENV } from '../config/env.tokens.js';
import { type Database } from '../db/database.type.js';
import { DATABASE } from '../db/db.tokens.js';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service.js';
import {
  CANNED_MOCK_AGENT_SCRIPT,
  describeProviderFailure,
  isCreditExhausted,
  UsageService,
} from '../llm/index.js';
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
  /** Whether the spend ceiling forced this turn onto the mock. */
  degraded: boolean;
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
  /**
   * The turn so far, when resuming one that paused for approval.
   *
   * The reader's answer lives inside the message parts — that is where the
   * AI SDK puts it, and there is nowhere else to carry it. Used only to
   * resume the paused loop; the conversation's history still comes from the
   * store, so this cannot rewrite what was said.
   */
  resumeFrom?: unknown[];
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
    private readonly budget: BudgetService,
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
      execute: async ({ writer }) => {
        // Before the data part, so it belongs to this message rather than to
        // one of its own.
        writer.write({ type: 'start' });
        writer.write({
          type: STREAM_PARTS.conversation,
          data: { conversationId: conversation.id },
        });

        const history = renderHistory(buildHistory(previous));

        /*
         * Resuming a paused turn means replaying it to the model, including
         * the approval the reader just answered. The SDK carries that answer
         * inside the message parts, so the messages are the only way to get
         * it back — `convertToModelMessages` turns them into the model's own
         * format, with the tools so it knows what each call was.
         */
        const resumed =
          options.resumeFrom === undefined
            ? undefined
            : await convertToModelMessages(options.resumeFrom as UIMessage[], {
                tools,
                // A turn can pause mid-call; dropping the incomplete one is
                // better than failing the resume over it.
                ignoreIncompleteToolCalls: true,
              });
        // Announced before any text, so the interface says so above the
        // answer rather than correcting itself once it has been read.
        const budget = await this.budget.status();

        if (budget.exhausted) {
          writer.write({
            type: STREAM_PARTS.budget,
            data: { degraded: true, resetsAt: budget.resetsAt?.toISOString() ?? null },
          });
        }

        // The mock provider answers directly unless it is scripted otherwise,
        // which would make /agent look identical to /chat and hide the one
        // thing it adds. Scripted to search once and then answer, so the tool
        // step is visible without a key; only the decision to search is fake.
        const { model } = this.chatModel(
          Object.keys(tools).length > 0 ? CANNED_MOCK_AGENT_SCRIPT : undefined,
          { forceMock: budget.exhausted },
        );
        const startedAt = Date.now();

        const result = streamText({
          model,
          tools,
          instructions: AGENT_SYSTEM_PROMPT,
          // Resuming replaces the prompt with the turn so far; starting fresh
          // uses the question and the stored history.
          ...(resumed === undefined
            ? { prompt: history === '' ? question : `${history}\n\nQuestion: ${question}` }
            : { messages: resumed }),
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
          degraded: budget.exhausted,
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

              return this.onProviderFailure(error);
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

        return this.onProviderFailure(error);
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

    // Only for the ledger's provider and model columns, so a degraded turn
    // records as the mock it actually was rather than as the configured
    // provider it never reached.
    const { provider, modelId } = this.chatModel(undefined, { forceMock: pending.degraded });

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

  /**
   * Turns a provider failure into a sentence, and latches an empty balance.
   *
   * The latch is what makes "out of credit" degrade rather than just fail.
   * Without it every later question would be another error, and every upload
   * a document stuck in `failed` - whereas the graceful path for a spent
   * budget already exists and this is what connects the two.
   *
   * Fire and forget: the reader is waiting on a stream that has already
   * failed, and holding it open to write a Redis key helps nobody.
   *
   * @param error Whatever the SDK threw.
   * @returns What to show in place of the answer.
   */
  private onProviderFailure(error: unknown): string {
    if (isCreditExhausted(error)) {
      void this.budget.markProviderExhausted();
    }

    return describeProviderFailure(error);
  }
}
