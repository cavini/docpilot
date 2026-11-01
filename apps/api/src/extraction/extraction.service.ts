import {
  type RegistryEntry,
  type SchemaName,
  SCHEMA_NAMES,
  isSchemaName,
  schemaEntry,
  validateItems,
} from '@docpilot/shared';
import { Inject, Injectable } from '@nestjs/common';
import { Output, generateText, streamText } from 'ai';
import { PinoLogger } from 'nestjs-pino';

import { CHAT_MODEL_FACTORY, type ChatModelFactory } from '../chat/chat.tokens.js';
import { InvalidRequestError } from '../common/errors/index.js';
import { type Env } from '../config/env.schema.js';
import { ENV } from '../config/env.tokens.js';
import { calculateCost, cannedMockExtraction, UsageService } from '../llm/index.js';
import { RetrievalService } from '../retrieval/index.js';

/** How many passages to extract from. */
const EXTRACT_TOP_K = 12;

/** What to extract, and from where. */
export interface ExtractOptions {
  schema: string;
  documentId?: string;
  query?: string;
  requestId?: string;
}

/** A passage an extraction drew on. */
export interface ExtractionCitation {
  n: number;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  headingPath: string | null;
}

/** What an extraction produced. */
export interface ExtractionResult {
  schema: SchemaName;
  items: unknown[];
  citations: ExtractionCitation[];
  /** Items the model produced that failed validation and were dropped. */
  dropped: number;
  /** Whether the first attempt failed and had to be repaired. */
  repaired: boolean;
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
}

/** Thrown when extraction fails twice: once, then once with the error. */
export class ExtractionFailedError extends InvalidRequestError {
  constructor(schema: string, reason: string) {
    super(
      `Could not extract ${schema}: the model's output did not match the schema, ` +
        `and did not after being told why. Last error: ${reason}`,
    );
  }
}

/**
 * Extracts structured data from the corpus.
 *
 * Retrieval first, then a model constrained to a schema the **server** holds.
 * A caller-supplied schema would be a caller-supplied contract: nothing
 * downstream could rely on it, and it would make this endpoint a way to ask
 * the server for arbitrary shapes.
 */
@Injectable()
export class ExtractionService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly retrieval: RetrievalService,
    private readonly usage: UsageService,
    private readonly logger: PinoLogger,
    @Inject(CHAT_MODEL_FACTORY) private readonly chatModel: ChatModelFactory,
  ) {
    this.logger.setContext(ExtractionService.name);
  }

  /**
   * Validates the schema name and retrieves what to extract from.
   *
   * Shared by both endpoints so the streaming one cannot drift from the
   * one-shot one on which names it accepts.
   *
   * @throws {InvalidRequestError} If the schema is not one the server knows.
   */
  async prepare(options: ExtractOptions): Promise<{
    name: SchemaName;
    entry: RegistryEntry;
    citations: ExtractionCitation[];
    context: string;
  }> {
    if (!isSchemaName(options.schema)) {
      // Naming the alternatives, so the caller's next attempt can succeed
      // rather than being another guess.
      throw new InvalidRequestError(
        `There is no schema called "${options.schema}". Known schemas: ${SCHEMA_NAMES.join(', ')}.`,
      );
    }

    const entry = schemaEntry(options.schema);

    const { results } = await this.retrieval.search({
      query: options.query ?? entry.defaultQuery,
      topK: EXTRACT_TOP_K,
      ...(options.documentId === undefined ? {} : { documentIds: [options.documentId] }),
    });

    return {
      name: options.schema,
      entry,
      citations: results.map((chunk, at) => ({
        n: at + 1,
        chunkId: chunk.chunkId,
        documentId: chunk.documentId,
        documentTitle: chunk.documentTitle,
        headingPath: chunk.headingPath,
      })),
      context: results
        .map(
          (chunk, at) =>
            `[${String(at + 1)}] ${chunk.headingPath ?? chunk.documentTitle}\n${chunk.content}`,
        )
        .join('\n\n'),
    };
  }

  /** What the model is told to look for. */
  private instructionsFor(entry: RegistryEntry, repairing?: string): string {
    return [
      `Extract ${entry.description}`,
      'Use only what the passages below state. Do not infer a value that is',
      'not written down; return fewer items rather than invented ones.',
      ...(repairing === undefined
        ? []
        : [
            '',
            'Your previous answer did not match the required shape. The',
            `problem was: ${repairing}`,
            'Produce the same information again, corrected.',
          ]),
    ].join('\n');
  }

  /**
   * Extracts, with one repair attempt.
   *
   * A response that fails validation is sent back **with the validation
   * error**, once. Models correct a malformed field when told which field and
   * why; they do not correct it when asked again identically, which is why
   * this is a repair rather than a retry.
   *
   * One attempt, not two: one is where the cost is a single extra call and
   * the benefit is the common case. A second would double the worst-case cost
   * to catch a case nobody has seen.
   *
   * @throws {InvalidRequestError} If the schema is unknown.
   * @throws {ExtractionFailedError} If both attempts fail validation.
   */
  async extract(options: ExtractOptions): Promise<ExtractionResult> {
    const { name, entry, citations, context } = await this.prepare(options);

    if (citations.length === 0) {
      // Nothing to extract from is not an error: an empty list is the honest
      // answer, and inventing items is the failure to avoid.
      return {
        schema: name,
        items: [],
        citations: [],
        dropped: 0,
        repaired: false,
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      };
    }

    // The mock answers prose unless scripted otherwise, so the endpoint would
    // be undemonstrable without a key. The script is obviously canned - see
    // `cannedMockExtraction`.
    const { model, provider, modelId } = this.chatModel(cannedMockExtraction(name));
    const startedAt = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;

    /** One attempt, returning what the model produced or why it failed. */
    const attempt = async (
      repairing?: string,
    ): Promise<{ produced: unknown[] } | { error: string }> => {
      try {
        const result = await generateText({
          model,
          output: Output.array({ element: entry.item }),
          instructions: this.instructionsFor(entry, repairing),
          prompt: context,
          maxOutputTokens: this.env.MAX_OUTPUT_TOKENS,
        });

        inputTokens += result.usage.inputTokens ?? 0;
        outputTokens += result.usage.outputTokens ?? 0;

        return { produced: Array.isArray(result.output) ? result.output : [] };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'unknown error' };
      }
    };

    let repaired = false;
    let outcome = await attempt();

    if ('error' in outcome) {
      repaired = true;
      this.logger.info({ schema: name, reason: outcome.error }, 'extraction failed; repairing');
      outcome = await attempt(outcome.error);
    }

    await this.usage.record({
      operation: 'structured',
      provider,
      model: modelId,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - startedAt,
      ...(options.requestId === undefined ? {} : { requestId: options.requestId }),
    });

    if ('error' in outcome) {
      // Twice is enough. A third attempt is the same prompt again, and the
      // caller is waiting.
      throw new ExtractionFailedError(name, outcome.error);
    }

    const { items, dropped } = validateItems(outcome.produced, entry);

    this.logger.info({ schema: name, items: items.length, dropped, repaired }, 'extracted');

    return {
      schema: name,
      items,
      citations,
      dropped,
      repaired,
      usage: {
        inputTokens,
        outputTokens,
        costUsd: calculateCost(provider, modelId, inputTokens, outputTokens),
      },
    };
  }

  /**
   * Extracts, yielding each item as it completes.
   *
   * `elementStream` gives finished array elements rather than a growing
   * partial object, which is what a table wants: a half-arrived row is
   * indistinguishable from a row with missing data, and showing one is worse
   * than showing nothing yet.
   *
   * No repair attempt here. A repair means discarding what was streamed and
   * starting again, and a table that empties itself and refills is worse than
   * one that says it ended early.
   *
   * @throws {InvalidRequestError} If the schema is unknown.
   */
  async *stream(
    options: ExtractOptions,
  ): AsyncGenerator<
    | { type: 'schema'; schema: SchemaName; citations: ExtractionCitation[] }
    | { type: 'item'; item: unknown }
    | { type: 'done'; dropped: number }
    | { type: 'error'; message: string }
  > {
    const { name, entry, citations, context } = await this.prepare(options);

    yield { type: 'schema', schema: name, citations };

    if (citations.length === 0) {
      yield { type: 'done', dropped: 0 };

      return;
    }

    const { model, provider, modelId } = this.chatModel(cannedMockExtraction(name));
    const startedAt = Date.now();
    const seen = new Set<string>();
    let dropped = 0;

    const result = streamText({
      model,
      output: Output.array({ element: entry.item }),
      instructions: this.instructionsFor(entry),
      prompt: context,
      maxOutputTokens: this.env.MAX_OUTPUT_TOKENS,
    });

    try {
      for await (const element of result.elementStream) {
        const parsed = entry.item.safeParse(element);

        if (!parsed.success) {
          dropped += 1;
          continue;
        }

        const identity = entry.identity(parsed.data);

        if (seen.has(identity)) {
          continue;
        }

        seen.add(identity);
        yield { type: 'item', item: parsed.data };
      }
    } catch (error) {
      // Whatever arrived stands; the caller is told it ended early rather
      // than being left to wonder why the table stopped filling.
      yield {
        type: 'error',
        message: error instanceof Error ? error.message : 'the extraction ended early',
      };

      return;
    } finally {
      // `usage` is a PromiseLike, not a Promise, so it has no `.catch` - and
      // a stream that broke rejects it. Recorded either way, because a call
      // that failed part-way still cost what it cost.
      let inputTokens = 0;
      let outputTokens = 0;

      try {
        const usage = await result.usage;
        inputTokens = usage.inputTokens ?? 0;
        outputTokens = usage.outputTokens ?? 0;
      } catch {
        // The provider never reported it. Zero is wrong but it is the only
        // honest number available.
      }

      await this.usage.record({
        operation: 'structured',
        provider,
        model: modelId,
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - startedAt,
        ...(options.requestId === undefined ? {} : { requestId: options.requestId }),
      });
    }

    yield { type: 'done', dropped };
  }
}
