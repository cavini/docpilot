import { Inject, Injectable } from '@nestjs/common';
import { generateText } from 'ai';
import { PinoLogger } from 'nestjs-pino';

import { InvalidRequestError } from '../common/errors/index.js';
import { type Env } from '../config/env.schema.js';
import { ENV } from '../config/env.tokens.js';
import { calculateCost, UsageService } from '../llm/index.js';
import { RetrievalService } from '../retrieval/index.js';
import { type Citation, resolveCitations } from './citations.js';
import { CHAT_MODEL_FACTORY, type ChatModelFactory } from './chat.tokens.js';
import { DONT_KNOW_ANSWER, SYSTEM_PROMPT, buildUserMessage } from './prompt.js';

/** What to ask. */
export interface AskOptions {
  question: string;
  topK?: number;
  documentIds?: string[];
  requestId?: string;
}

/** An answer, its citations, and what it cost. */
export interface Answer {
  answer: string;
  citations: Citation[];
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
}

/** Thrown when the model returns nothing usable. */
export class EmptyAnswerError extends InvalidRequestError {
  constructor() {
    super('The model returned an empty answer.');
  }
}

/**
 * Answers a question from the corpus, with citations.
 *
 * Retrieval first, then a grounded prompt, then citation resolution. The model
 * is never asked a question without context, and never trusted to have cited
 * something that was actually supplied.
 */
@Injectable()
export class AskService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly retrieval: RetrievalService,
    private readonly usage: UsageService,
    private readonly logger: PinoLogger,
    @Inject(CHAT_MODEL_FACTORY) private readonly chatModel: ChatModelFactory,
  ) {
    this.logger.setContext(AskService.name);
  }

  /**
   * Answers a question.
   *
   * When retrieval finds nothing, **the model is not called at all**. There is
   * nothing to ground an answer in, so asking anyway would spend money to
   * produce exactly the refusal that can be returned directly — and would
   * occasionally produce something worse, because a model given no context
   * sometimes answers from training instead.
   *
   * @param options The question, and optional filters.
   * @returns The answer, its citations, and what it cost.
   * @throws {InvalidRequestError} If the question is empty or too long.
   * @throws {EmptyAnswerError} If the model returns nothing.
   */
  async ask(options: AskOptions): Promise<Answer> {
    const question = options.question.trim();

    if (question.length === 0) {
      throw new InvalidRequestError('The question is empty.');
    }

    if (question.length > this.env.MAX_QUESTION_LENGTH) {
      throw new InvalidRequestError(
        `The question is longer than the ${String(this.env.MAX_QUESTION_LENGTH)} character limit.`,
      );
    }

    const { results } = await this.retrieval.search({
      query: question,
      topK: options.topK ?? this.env.RETRIEVAL_TOP_K,
      ...(options.documentIds === undefined ? {} : { documentIds: options.documentIds }),
    });

    if (results.length === 0) {
      this.logger.info({ question: question.length }, 'nothing retrieved; answering directly');

      return {
        answer: DONT_KNOW_ANSWER,
        citations: [],
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      };
    }

    const { model, provider, modelId } = this.chatModel();
    const startedAt = Date.now();

    const generated = await generateText({
      model,
      instructions: SYSTEM_PROMPT,
      prompt: buildUserMessage(question, results),
      maxOutputTokens: this.env.MAX_OUTPUT_TOKENS,
    });

    const inputTokens = generated.usage.inputTokens ?? 0;
    const outputTokens = generated.usage.outputTokens ?? 0;

    await this.usage.record({
      operation: 'chat',
      provider,
      model: modelId,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - startedAt,
      ...(options.requestId === undefined ? {} : { requestId: options.requestId }),
    });

    if (generated.text.trim().length === 0) {
      throw new EmptyAnswerError();
    }

    const { answer, citations } = resolveCitations(generated.text, results);

    this.logger.info(
      {
        retrieved: results.length,
        cited: citations.length,
        inputTokens,
        outputTokens,
        durationMs: Date.now() - startedAt,
      },
      'answered',
    );

    return {
      answer,
      citations,
      usage: {
        inputTokens,
        outputTokens,
        costUsd: calculateCost(provider, modelId, inputTokens, outputTokens),
      },
    };
  }
}
