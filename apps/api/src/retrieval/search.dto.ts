import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

/** The most documents a single search may be restricted to. */
export const MAX_DOCUMENT_FILTER = 50;

/** Body of `POST /search`. */
export class SearchRequestDto {
  /** What to search for. */
  @ApiProperty({ example: 'how do I authenticate?' })
  @IsString()
  query: string;

  /** How many results to return. Defaults to `RETRIEVAL_TOP_K`. */
  @ApiPropertyOptional({ minimum: 1, maximum: 50, example: 8 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  topK?: number;

  /** Restrict the search to these documents. Omit to search everything. */
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_DOCUMENT_FILTER)
  @IsUUID('4', { each: true })
  documentIds?: string[];
}

/** One passage found by a search. */
export class SearchResultDto {
  @ApiProperty({ format: 'uuid' })
  chunkId: string;

  @ApiProperty({ format: 'uuid' })
  documentId: string;

  @ApiProperty({ example: 'lumen-api' })
  documentTitle: string;

  /** The passage itself. */
  @ApiProperty()
  content: string;

  /** Where in the document this passage sits. */
  @ApiProperty({ required: false, nullable: true, example: 'Lumen API > Authentication' })
  headingPath: string | null;

  @ApiProperty({ required: false, nullable: true, example: 3 })
  pageStart: number | null;

  @ApiProperty({ required: false, nullable: true, example: 3 })
  pageEnd: number | null;

  /**
   * Fused relevance score. Comparable within one search only — it is a sum of
   * reciprocal ranks, not a probability.
   */
  @ApiProperty({ example: 0.0323 })
  score: number;

  /** Rank in the vector search, or null if that search did not find it. */
  @ApiProperty({ required: false, nullable: true, example: 1 })
  vectorRank: number | null;

  /** Rank in the keyword search, or null if that search did not find it. */
  @ApiProperty({ required: false, nullable: true, example: 3 })
  keywordRank: number | null;
}

/** Body of a successful `POST /search`. */
export class SearchResponseDto {
  @ApiProperty({ type: [SearchResultDto] })
  results: SearchResultDto[];

  /** How long the search took, in milliseconds. */
  @ApiProperty({ example: 41 })
  tookMs: number;

  /** Whether the query embedding came from cache rather than the provider. */
  @ApiProperty({ example: false })
  cached: boolean;
}
