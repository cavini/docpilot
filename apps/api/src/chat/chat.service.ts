import { Inject, Injectable } from '@nestjs/common';
import { type UIMessageChunk, createUIMessageStream, streamText, toUIMessageStream } from 'ai';
import { PinoLogger } from 'nestjs-pino';

import { InvalidRequestError } from '../common/errors/index.js';
import { BudgetService } from '../budget/index.js';
import { type Env } from '../config/env.schema.js';
import { ENV } from '../config/env.tokens.js';
import { calculateCost, describeProviderFailure, UsageService } from '../llm/index.js';
import { type RetrievedChunk, RetrievalService } from '../retrieval/index.js';
import { CHAT_MODEL_FACTORY, type ChatModelFactory } from './chat.tokens.js';
import { type Citation, resolveCitations } from './citations.js';
import { ConversationsService } from './conversations.service.js';
import { buildHistory, renderHistory } from './history.js';
import { DONT_KNOW_ANSWER, SYSTEM_PROMPT, buildUserMessage } from './prompt.js';
import { STREAM_PARTS } from './stream-parts.js';

/** A turn waiting to be stored once its stream has ended. */
interface PendingTurn {
  conversationId: string;
  question: string;
  result: ReturnType<typeof streamText>;
  context: RetrievedChunk[];
  provider: string;
  modelId: string;
  startedAt: number;
  requestId?: string;
}

/** What to ask, and where to put the answer. */
export interface ChatOptions {
  question: string;
  conversationId?: string;
  topK?: number;
  documentIds?: string[];
  requestId?: string;
  /** Aborts generation when the client disconnects or presses stop. */
  signal?: AbortSignal;
}

/**
 * Answers questions in a conversation, streaming as the model writes.
 *
 * The same pipeline as `/ask` — retrieve, ground, resolve citations — with
 * three differences that matter:
 *
 * - The answer is streamed, so the first words appear about as fast as
 *   retrieval allows rather than after the whole generation.
 * - Previous turns are in the prompt, so a follow-up can refer to them.
 * - **Retrieval runs again for every question.** Reusing the first question's
 *   passages for a follow-up would answer a different question confidently,
 *   which is the failure this product exists to avoid.
 */
@Injectable()
export class ChatService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly retrieval: RetrievalService,
    private readonly conversations: ConversationsService,
    private readonly usage: UsageService,
    private readonly logger: PinoLogger,
    @Inject(CHAT_MODEL_FACTORY) private readonly chatModel: ChatModelFactory,
    private readonly budget: BudgetService,
  ) {
    this.logger.setContext(ChatService.name);
  }

  /**
   * Streams an answer, persisting the turn when it ends.
   *
   * Everything that can fail before the stream opens — validation, an unknown
   * conversation — throws here, so the caller can answer with an ordinary JSON
   * error and a real status code. Once the stream is open the status is
   * already 200, and a failure can only be reported as an error part.
   *
   * The turn is persisted in `onFinish`, which the SDK calls whether the
   * stream completed, was aborted, or errored. **A stopped answer is stored**:
   * a partial answer is still something the reader read, and discarding it
   * loses the context of whatever they ask next.
   *
   * @param options The question, the conversation, and optional filters.
   * @returns A UI message stream for the caller to pipe to the response.
   * @throws {InvalidRequestError} If the question is empty or too long.
   * @throws {NotFoundError} If the conversation does not exist.
   */
  async stream(options: ChatOptions): Promise<ReadableStream<UIMessageChunk>> {
    const question = options.question.trim();

    if (question.length === 0) {
      throw new InvalidRequestError('The question is empty.');
    }

    if (question.length > this.env.MAX_QUESTION_LENGTH) {
      throw new InvalidRequestError(
        `The question is longer than the ${String(this.env.MAX_QUESTION_LENGTH)} character limit.`,
      );
    }

    // Before the stream opens, so an unknown id is a 404 rather than an error
    // part inside a 200.
    const conversation = await this.conversations.open(options.conversationId, question);
    const previous = await this.conversations.turnsOf(conversation.id);

    // Captured by `execute` and read by `onFinish`, which the SDK runs only
    // after every merged stream has drained. Persisting inside `execute`
    // instead deadlocks: awaiting the result needs the merged stream consumed,
    // and the merge is not drained until `execute` resolves.
    let pending: PendingTurn | undefined;

    return createUIMessageStream({
      execute: async ({ writer }) => {
        // The message has to be started before anything is written into it.
        // Data parts written ahead of a `start` chunk belong to no message, so
        // the client opens one for them and a second for the text — which
        // renders as an empty assistant bubble above the real answer. The
        // merged stream below is told not to send its own start.
        writer.write({ type: 'start' });

        writer.write({
          type: STREAM_PARTS.conversation,
          data: { conversationId: conversation.id },
        });

        const { results } = await this.retrieval.search({
          query: question,
          topK: options.topK ?? this.env.RETRIEVAL_TOP_K,
          ...(options.documentIds === undefined ? {} : { documentIds: options.documentIds }),
        });

        if (results.length === 0) {
          // Nothing to ground an answer in, so the model is not called at all.
          // Asking anyway would spend money to produce exactly this refusal,
          // and would occasionally produce something worse.
          writer.write({ type: STREAM_PARTS.citations, data: { citations: [] } });
          writer.write({ type: 'text-start', id: 'refusal' });
          writer.write({ type: 'text-delta', id: 'refusal', delta: DONT_KNOW_ANSWER });
          writer.write({ type: 'text-end', id: 'refusal' });

          await this.conversations.appendTurn(conversation.id, question, {
            content: DONT_KNOW_ANSWER,
            outcome: 'complete',
            citations: [],
            inputTokens: 0,
            outputTokens: 0,
          });

          return;
        }

        // Citations before any text: the passages are known before generation
        // starts, so the sources panel renders while the answer is still being
        // written and a chip is clickable the moment its marker appears.
        const provisional = results.map((chunk, at): Citation => ({
          n: at + 1,
          chunkId: chunk.chunkId,
          documentId: chunk.documentId,
          documentTitle: chunk.documentTitle,
          headingPath: chunk.headingPath,
          pageStart: chunk.pageStart,
          pageEnd: chunk.pageEnd,
          snippet: chunk.content,
        }));
        writer.write({ type: STREAM_PARTS.citations, data: { citations: provisional } });

        const history = buildHistory(previous);
        const rendered = renderHistory(history);

        // Announced before any text, so the interface says so above the
        // answer rather than correcting itself once it has been read.
        const budget = await this.budget.status();

        if (budget.exhausted) {
          writer.write({
            type: STREAM_PARTS.budget,
            data: { degraded: true, resetsAt: budget.resetsAt?.toISOString() ?? null },
          });
        }

        const { model, provider, modelId } = this.chatModel(undefined, {
          forceMock: budget.exhausted,
        });
        const startedAt = Date.now();

        const result = streamText({
          model,
          instructions: SYSTEM_PROMPT,
          prompt:
            rendered === ''
              ? buildUserMessage(question, results)
              : `${rendered}\n\n${buildUserMessage(question, results)}`,
          maxOutputTokens: this.env.MAX_OUTPUT_TOKENS,
          ...(options.signal === undefined ? {} : { abortSignal: options.signal }),
        });

        pending = {
          conversationId: conversation.id,
          question,
          result,
          context: results,
          provider,
          modelId,
          startedAt,
          ...(options.requestId === undefined ? {} : { requestId: options.requestId }),
        };

        writer.merge(
          toUIMessageStream({
            stream: result.stream,
            // Already sent above, before the citations.
            sendStart: false,
            onError: (error: unknown) => {
              this.logger.warn(
                { err: error, conversationId: conversation.id },
                'chat stream failed',
              );

              return describeProviderFailure(error);
            },
          }),
        );
      },
      // `onEnd`, not `onFinish` — the latter is deprecated. Either way the SDK
      // runs it only after every merged stream has drained and awaits it
      // before closing, which is what makes the result's final text available
      // here without deadlocking.
      onEnd: async () => {
        if (pending !== undefined) {
          await this.persist(pending);
        }
      },
      onError: (error: unknown) => {
        this.logger.error({ err: error }, 'chat stream aborted');

        return describeProviderFailure(error);
      },
    });
  }

  /**
   * Stores the turn once generation has ended, however it ended.
   *
   * Reads the finished text and usage from the stream result rather than
   * accumulating the deltas by hand, so what is stored is exactly what the
   * client was sent.
   */
  private async persist(options: PendingTurn): Promise<void> {
    let text = '';
    let outcome: 'complete' | 'stopped' | 'failed' = 'complete';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      text = await options.result.text;
      const usage = await options.result.usage;
      inputTokens = usage.inputTokens ?? 0;
      outputTokens = usage.outputTokens ?? 0;

      // An abort surfaces as a finish reason rather than as a thrown error,
      // so it has to be checked as well as caught. 'length' counts as
      // complete: the model stopped because it was told to, not because
      // anything went wrong.
      const reason = await options.result.finishReason;

      if (reason !== 'stop' && reason !== 'length') {
        outcome = reason === 'error' ? 'failed' : 'stopped';
      }
    } catch {
      // The stream broke. Whatever arrived is still what the reader read.
      outcome = 'failed';
    }

    const { answer, citations } = resolveCitations(text, options.context);

    await this.usage.record({
      operation: 'chat',
      provider: options.provider,
      model: options.modelId,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - options.startedAt,
      ...(options.requestId === undefined ? {} : { requestId: options.requestId }),
    });

    await this.conversations.appendTurn(options.conversationId, options.question, {
      content: answer,
      outcome,
      citations,
      inputTokens,
      outputTokens,
    });

    this.logger.info(
      {
        conversationId: options.conversationId,
        outcome,
        cited: citations.length,
        inputTokens,
        outputTokens,
        costUsd: calculateCost(options.provider, options.modelId, inputTokens, outputTokens),
        durationMs: Date.now() - options.startedAt,
      },
      'chat turn stored',
    );
  }
}
