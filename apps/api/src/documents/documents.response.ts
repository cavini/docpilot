import { ApiProperty } from '@nestjs/swagger';

/** A document and where it is in the ingestion pipeline. */
export class DocumentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  /** Display name, the filename without its extension. */
  @ApiProperty({ example: 'billing-api' })
  title: string;

  /** The name the file was uploaded under. */
  @ApiProperty({ example: 'billing-api.pdf' })
  sourceFilename: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType: string;

  @ApiProperty({ example: 418_233 })
  sizeBytes: number;

  /** Where the document is in the pipeline. */
  @ApiProperty({
    enum: ['queued', 'parsing', 'chunking', 'embedding', 'ready', 'failed'],
    example: 'ready',
  })
  status: string;

  /** How far through ingestion, from 0 to 100. */
  @ApiProperty({ example: 100 })
  progress: number;

  /** Detected language, which decides the text-search stemmer. */
  @ApiProperty({ required: false, enum: ['english', 'portuguese'], nullable: true })
  language: string | null;

  /** Why ingestion failed, when it did. */
  @ApiProperty({ required: false, nullable: true, example: null })
  error: string | null;

  /** Pages, for formats that have them. */
  @ApiProperty({ required: false, nullable: true, example: 12 })
  pageCount: number | null;

  /** Retrievable passages stored for this document. */
  @ApiProperty({ example: 48 })
  chunkCount: number;

  @ApiProperty({ example: '2026-10-30T22:14:03.118Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-10-30T22:14:09.441Z' })
  updatedAt: string;
}

/** A page of documents, newest first. */
export class DocumentPageDto {
  @ApiProperty({ type: [DocumentResponseDto] })
  items: DocumentResponseDto[];

  /**
   * Pass back as `cursor` to fetch the next page. Null when this is the last.
   */
  @ApiProperty({ required: false, nullable: true, example: '2026-10-30T22:14:03.118Z' })
  nextCursor: string | null;
}
