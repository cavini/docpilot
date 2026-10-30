import { type Chunk, type ChunkOptions } from './chunk.js';
import { type ParsedDocument } from './segment.js';

/**
 * Splits a parsed document into passages for embedding.
 *
 * See `docs/specs/chunking.md` for the behaviour this implements and
 * `docs/rag-pipeline.md` for why it is shaped this way.
 *
 * @param document The parsed document, with offsets into its normalised text.
 * @param options Size, overlap, and how to count tokens.
 * @returns Chunks in document order, numbered from 0.
 */
export function chunkDocument(_document: ParsedDocument, _options: ChunkOptions): Chunk[] {
  throw new Error('not implemented');
}
