import { tool } from 'ai';
import { z } from 'zod';

import { type Env } from '../../config/env.schema.js';
import { type RetrievalService } from '../../retrieval/index.js';
import { type ToolFailure, fail, withTimeout } from './tool-result.js';

/** Most results the model may ask for in one call. */
const MAX_TOP_K = 20;

/** How long the search may take before the loop stops waiting. */
const TIMEOUT_MS = 15_000;

/** What the model may ask for. */
export const searchDocsInput = z.object({
  query: z
    .string()
    .min(1)
    .describe("What to search for. Your own phrasing, not necessarily the user's."),
  topK: z.number().int().min(1).max(MAX_TOP_K).optional().describe('How many passages to return.'),
  documentIds: z
    .array(z.uuid())
    .max(50)
    .optional()
    .describe('Restrict the search to these documents. Omit to search everything.'),
});

/** One passage, numbered so the model can cite it. */
export interface SearchDocsResult {
  n: number;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  headingPath: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  content: string;
}

/** What the tool returns on success. */
export interface SearchDocsOutput {
  results: SearchDocsResult[];
}

/**
 * Builds the `search_docs` tool.
 *
 * The same hybrid search `POST /search` runs, handed to the model so it can
 * look again with better terms after reading what the first search returned —
 * which is the thing `/chat` cannot do, since it retrieves once with the
 * reader's own words.
 *
 * Results are numbered from 1 so the model can cite `[n]` directly, matching
 * the convention the answer path already uses.
 *
 * @param retrieval The retrieval service.
 * @param env Validated configuration, for the default `topK`.
 * @returns A tool the agent loop can call.
 */
export function createSearchDocsTool(retrieval: RetrievalService, env: Env) {
  return tool({
    description:
      'Search the uploaded documents and return the most relevant passages, ' +
      'each numbered so you can cite it as [n]. Use it more than once with ' +
      'different wording if the first search does not find what you need.',
    inputSchema: searchDocsInput,
    execute: async (input): Promise<SearchDocsOutput | ToolFailure> =>
      withTimeout('search_docs', TIMEOUT_MS, async () => {
        try {
          const { results } = await retrieval.search({
            query: input.query,
            topK: input.topK ?? env.RETRIEVAL_TOP_K,
            ...(input.documentIds === undefined ? {} : { documentIds: input.documentIds }),
          });

          return {
            results: results.map((chunk, at) => ({
              n: at + 1,
              chunkId: chunk.chunkId,
              documentId: chunk.documentId,
              documentTitle: chunk.documentTitle,
              headingPath: chunk.headingPath,
              pageStart: chunk.pageStart,
              pageEnd: chunk.pageEnd,
              content: chunk.content,
            })),
          };
        } catch (error) {
          // Returned rather than thrown: "I could not search" is something the
          // model can tell the reader, where an exception ends the turn with
          // nothing.
          return fail(
            'unavailable',
            `The search could not run: ${error instanceof Error ? error.message : 'unknown error'}.`,
          );
        }
      }),
  });
}
