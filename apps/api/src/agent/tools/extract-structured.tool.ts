import { Output, generateText, tool } from 'ai';
import { z } from 'zod';

import { type ChatModelFactory } from '../../chat/chat.tokens.js';
import { type Env } from '../../config/env.schema.js';
import { type UsageService } from '../../llm/index.js';
import { type RetrievalService } from '../../retrieval/index.js';
import { SCHEMA_NAMES, SCHEMA_REGISTRY, isSchemaName } from './schema-registry.js';
import { type ToolFailure, fail, withTimeout } from './tool-result.js';

/** How long extraction may take. */
const TIMEOUT_MS = 60_000;

/** How many passages to extract from. */
const EXTRACT_TOP_K = 12;

/** What the model may ask for. */
export const extractStructuredInput = z.object({
  schema: z
    .string()
    .min(1)
    .describe(`Name of a known schema. One of: ${SCHEMA_NAMES.join(', ')}.`),
  documentId: z.uuid().optional().describe('Restrict extraction to one document.'),
  query: z
    .string()
    .max(200)
    .optional()
    .describe("What to look for. Leave it out to use the schema's own default."),
});

/** What survived validation, and what did not. */
export interface ValidatedItems {
  items: unknown[];
  dropped: number;
}

/**
 * Validates and deduplicates what the model produced.
 *
 * A second line of defence. The AI SDK already constrains the provider to the
 * schema and rejects a response that does not match — but providers differ in
 * how strictly they enforce one, and a provider that passes an almost-right
 * item through would otherwise send it to a caller who finds out later and
 * elsewhere.
 *
 * An item that fails is **dropped and counted** rather than failing the call:
 * one bad endpoint among ten good ones is still nine endpoints, and the count
 * tells the model something was lost.
 *
 * @param produced What the model returned.
 * @param entry The registry entry being extracted.
 * @returns The valid, deduplicated items and how many were dropped.
 */
export function validateItems(
  produced: unknown[],
  entry: {
    item: { safeParse: (value: unknown) => { success: boolean; data?: unknown } };
    identity: (item: unknown) => string;
  },
): ValidatedItems {
  const items: unknown[] = [];
  const seen = new Set<string>();
  let dropped = 0;

  for (const candidate of produced) {
    const parsed = entry.item.safeParse(candidate);

    if (!parsed.success) {
      dropped += 1;
      continue;
    }

    const identity = entry.identity(parsed.data);

    if (seen.has(identity)) {
      continue;
    }

    seen.add(identity);
    items.push(parsed.data);
  }

  return { items, dropped };
}

/** What the tool returns on success. */
export interface ExtractStructuredOutput {
  schema: string;
  items: unknown[];
  citations: { n: number; chunkId: string }[];
  /** Items the model produced that did not validate, and were dropped. */
  dropped: number;
}

/**
 * Builds the `extract_structured` tool.
 *
 * Extraction constrained by a schema the **server** knows, named by the model
 * rather than supplied by it. A model-supplied schema is a model-supplied
 * contract: nothing downstream could rely on it, and it would be a way to make
 * the server produce arbitrary shapes on request.
 *
 * Retrieval runs first. Extracting from the whole corpus would be a
 * summarisation problem wearing a different hat, and would cost accordingly.
 *
 * The provider is asked to constrain its output to the schema, **and** every
 * item is validated here. Providers differ in how well they enforce a schema,
 * and "mostly valid" is the failure mode that reaches a caller as a runtime
 * error somewhere else entirely.
 *
 * @param retrieval Finds the passages to extract from.
 * @param chatModel Builds the model.
 * @param usage The ledger.
 * @param env Validated configuration.
 * @returns A tool the agent loop can call.
 */
export function createExtractStructuredTool(
  retrieval: RetrievalService,
  chatModel: ChatModelFactory,
  usage: UsageService,
  env: Env,
) {
  return tool({
    description:
      'Extract structured data from the documents using one of the schemas ' +
      `this server knows: ${SCHEMA_NAMES.join(', ')}. Use it when the user ` +
      'asks for a list or for JSON rather than for prose.',
    inputSchema: extractStructuredInput,
    execute: async (input): Promise<ExtractStructuredOutput | ToolFailure> =>
      withTimeout('extract_structured', TIMEOUT_MS, async () => {
        if (!isSchemaName(input.schema)) {
          // Naming the alternatives, so the model's next attempt can succeed
          // rather than being another guess.
          return fail(
            'invalid_input',
            `There is no schema called "${input.schema}". Known schemas: ${SCHEMA_NAMES.join(', ')}.`,
          );
        }

        const entry = SCHEMA_REGISTRY[input.schema];

        const { results } = await retrieval.search({
          query: input.query ?? entry.defaultQuery,
          topK: EXTRACT_TOP_K,
          ...(input.documentId === undefined ? {} : { documentIds: [input.documentId] }),
        });

        if (results.length === 0) {
          // Nothing to extract from is not an error: an empty list is the
          // honest answer, and inventing items is the failure to avoid.
          return { schema: input.schema, items: [], citations: [], dropped: 0 };
        }

        const context = results
          .map(
            (chunk, at) =>
              `[${String(at + 1)}] ${chunk.headingPath ?? chunk.documentTitle}\n${chunk.content}`,
          )
          .join('\n\n');

        const { model, provider, modelId } = chatModel();
        const startedAt = Date.now();

        let produced: unknown[];
        let inputTokens: number;
        let outputTokens: number;

        try {
          const result = await generateText({
            model,
            output: Output.array({ element: entry.item }),
            instructions: [
              `Extract ${entry.description}`,
              'Use only what the passages below state. Do not infer an endpoint,',
              'a field or a value that is not written down; return fewer items',
              'rather than invented ones.',
            ].join('\n'),
            prompt: context,
            maxOutputTokens: env.MAX_OUTPUT_TOKENS,
          });

          produced = Array.isArray(result.output) ? result.output : [];
          inputTokens = result.usage.inputTokens ?? 0;
          outputTokens = result.usage.outputTokens ?? 0;
        } catch (error) {
          // The SDK rejects a response that does not match the schema at all.
          // Returned rather than thrown, so the model can try a narrower query
          // instead of the turn ending with nothing.
          return fail(
            'unavailable',
            `The extraction did not produce valid ${input.schema}: ` +
              `${error instanceof Error ? error.message : 'unknown error'}.`,
          );
        }

        await usage.record({
          operation: 'structured',
          provider,
          model: modelId,
          inputTokens,
          outputTokens,
          latencyMs: Date.now() - startedAt,
        });

        const { items, dropped } = validateItems(produced, entry);

        return {
          schema: input.schema,
          items,
          citations: results.map((chunk, at) => ({ n: at + 1, chunkId: chunk.chunkId })),
          dropped,
        };
      }),
  });
}
