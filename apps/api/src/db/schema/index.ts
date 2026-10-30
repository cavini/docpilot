/**
 * Drizzle table definitions.
 *
 * Every table lives in its own file and is re-exported here, so `drizzle-kit`
 * sees the whole schema from one entry point and the generated migrations stay
 * in step with the code.
 */

export { EMBEDDING_DIMENSIONS, chunks, type ChunkRow, type NewChunkRow } from './chunks.js';
export {
  documentLanguage,
  documentStatus,
  documents,
  type DocumentRow,
  type NewDocumentRow,
} from './documents.js';
export { llmOperation, llmUsage, type LlmUsageRow, type NewLlmUsageRow } from './llm-usage.js';
