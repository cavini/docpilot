import { generateText, tool } from 'ai';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { type Env } from '../../config/env.schema.js';
import { type Database } from '../../db/database.type.js';
import { chunks, documents } from '../../db/schema/index.js';
import { type UsageService } from '../../llm/index.js';
import { type ChatModelFactory } from '../../chat/chat.tokens.js';
import { type ToolFailure, fail, withTimeout } from './tool-result.js';

/** Most chunks this tool will summarise before refusing. */
export const SUMMARY_MAX_CHUNKS = 60;

/**
 * Chunks a single map step covers.
 *
 * Several per call rather than one: a model call per chunk makes a
 * forty-chunk document forty round trips, and the passages in one call give
 * each other context.
 */
const CHUNKS_PER_MAP_STEP = 8;

/** How long the whole map-reduce may take. */
const TIMEOUT_MS = 90_000;

/** What the model may ask for. */
export const summarizeDocumentInput = z.object({
  documentId: z.uuid().describe('Which document to summarise.'),
  focus: z
    .string()
    .max(200)
    .optional()
    .describe('What the summary should concentrate on, such as "the authentication parts".'),
});

/** A passage the summary drew on. */
export interface SummaryCitation {
  n: number;
  chunkId: string;
  headingPath: string | null;
}

/** What the tool returns on success. */
export interface SummarizeDocumentOutput {
  summary: string;
  documentTitle: string;
  chunksCovered: number;
  citations: SummaryCitation[];
}

/** Builds the instruction for one map step. */
function mapPrompt(focus: string | undefined): string {
  return [
    'Summarise the numbered passages below in a few sentences each, keeping',
    'the facts and dropping the prose. Refer to a passage by its number.',
    ...(focus === undefined
      ? []
      : [`Concentrate on: ${focus}. Say so briefly if a passage covers none of it.`]),
  ].join('\n');
}

/** Builds the instruction for the reduce step. */
function reducePrompt(focus: string | undefined): string {
  return [
    'Combine the partial summaries below into one, without repeating yourself.',
    'Keep the passage numbers that support each point.',
    ...(focus === undefined ? [] : [`Concentrate on: ${focus}.`]),
  ].join('\n');
}

/**
 * Builds the `summarize_document` tool.
 *
 * Map-reduce, because a long document does not fit in one prompt and
 * truncating it to fit produces a summary of the first third that claims to be
 * a summary of the document.
 *
 * The `focus` goes into **every map prompt**, not only the reduce. By the time
 * the reduce step runs, the detail a focus would have selected for has already
 * been discarded — focusing at the end selects among summaries of the wrong
 * things.
 *
 * A document above {@link SUMMARY_MAX_CHUNKS} is refused rather than silently
 * costing dozens of model calls, and the refusal says how large it is so the
 * reader can narrow the request.
 *
 * @param db The database.
 * @param chatModel Builds the model to summarise with.
 * @param usage The ledger; every map and reduce call is recorded.
 * @param env Validated configuration.
 * @returns A tool the agent loop can call.
 */
export function createSummarizeDocumentTool(
  db: Database,
  chatModel: ChatModelFactory,
  usage: UsageService,
  env: Env,
) {
  return tool({
    description:
      'Summarise a whole document. Use this rather than searching when the ' +
      'question is about a document as a whole, since search returns only the ' +
      'passages most like the question.',
    inputSchema: summarizeDocumentInput,
    execute: async (input): Promise<SummarizeDocumentOutput | ToolFailure> =>
      withTimeout('summarize_document', TIMEOUT_MS, async () => {
        const [document] = await db
          .select()
          .from(documents)
          .where(eq(documents.id, input.documentId));

        if (!document) {
          return fail('not_found', `There is no document with id ${input.documentId}.`);
        }

        if (document.status !== 'ready') {
          // Summarising a document mid-ingestion would summarise whichever
          // passages happen to be written, and say nothing about the rest.
          return fail(
            'not_ready',
            `"${document.title}" is still being processed (${document.status}). Try again once it is ready.`,
          );
        }

        if (document.chunkCount > SUMMARY_MAX_CHUNKS) {
          return fail(
            'too_large',
            `"${document.title}" has ${String(document.chunkCount)} passages, above the ` +
              `${String(SUMMARY_MAX_CHUNKS)} this tool will summarise. Ask about part of it instead.`,
          );
        }

        const passages = await db
          .select()
          .from(chunks)
          .where(and(eq(chunks.documentId, input.documentId)))
          .orderBy(asc(chunks.ordinal));

        if (passages.length === 0) {
          return fail('not_ready', `"${document.title}" has no passages to summarise.`);
        }

        const { model, provider, modelId } = chatModel();
        const citations: SummaryCitation[] = passages.map((chunk, at) => ({
          n: at + 1,
          chunkId: chunk.id,
          headingPath: chunk.headingPath,
        }));

        /** Runs one model call and records what it cost. */
        const call = async (instructions: string, prompt: string): Promise<string> => {
          const startedAt = Date.now();
          const result = await generateText({
            model,
            instructions,
            prompt,
            maxOutputTokens: env.MAX_OUTPUT_TOKENS,
          });

          const inputTokens = result.usage.inputTokens ?? 0;
          const outputTokens = result.usage.outputTokens ?? 0;

          await usage.record({
            operation: 'agent',
            provider,
            model: modelId,
            inputTokens,
            outputTokens,
            latencyMs: Date.now() - startedAt,
          });

          return result.text;
        };

        // Map: a few passages per call, numbered so the summaries can refer
        // back to them.
        const groups: string[] = [];

        for (let at = 0; at < passages.length; at += CHUNKS_PER_MAP_STEP) {
          groups.push(
            passages
              .slice(at, at + CHUNKS_PER_MAP_STEP)
              .map(
                (chunk, offset) =>
                  `[${String(at + offset + 1)}] ${chunk.headingPath ?? document.title}\n${chunk.content}`,
              )
              .join('\n\n'),
          );
        }

        const partials = await Promise.all(
          groups.map(async (group) => call(mapPrompt(input.focus), group)),
        );

        // One group means one call is already the whole summary; a reduce step
        // would be a model call to rewrite a summary of everything.
        const summary =
          partials.length === 1
            ? (partials[0] ?? '')
            : await call(reducePrompt(input.focus), partials.join('\n\n---\n\n'));

        return {
          summary,
          documentTitle: document.title,
          chunksCovered: passages.length,
          citations,
        };
      }),
  });
}
