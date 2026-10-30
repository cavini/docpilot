import { type DocumentRow } from '../db/schema/index.js';
import { type DocumentResponseDto } from './documents.response.js';

/**
 * Converts a database row into the API's representation.
 *
 * An explicit mapping rather than returning the row: it keeps internal
 * columns, `sha256` and `storageKey`, out of responses, and it means a schema
 * change cannot silently alter the published contract.
 *
 * @param row The document as stored.
 * @returns The document as published.
 */
export function toDocumentResponse(row: DocumentRow): DocumentResponseDto {
  return {
    id: row.id,
    title: row.title,
    sourceFilename: row.sourceFilename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    status: row.status,
    progress: row.progress,
    language: row.language,
    error: row.error,
    pageCount: row.pageCount,
    chunkCount: row.chunkCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
