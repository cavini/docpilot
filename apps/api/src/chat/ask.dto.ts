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

/** Body of `POST /ask`. */
export class AskRequestDto {
  /** The question to answer from the corpus. */
  @ApiProperty({ example: 'How do I authenticate?' })
  @IsString()
  question: string;

  /** How many passages to retrieve. Defaults to `RETRIEVAL_TOP_K`. */
  @ApiPropertyOptional({ minimum: 1, maximum: 20, example: 8 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  topK?: number;

  /** Restrict the answer to these documents. */
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  documentIds?: string[];
}

/** A passage the answer drew on. */
export class CitationDto {
  /** The number as it appears in the answer text. */
  @ApiProperty({ example: 1 })
  n: number;

  @ApiProperty({ format: 'uuid' })
  chunkId: string;

  @ApiProperty({ format: 'uuid' })
  documentId: string;

  @ApiProperty({ example: 'lumen-api' })
  documentTitle: string;

  @ApiProperty({ required: false, nullable: true, example: 'Lumen API > Authentication' })
  headingPath: string | null;

  @ApiProperty({ required: false, nullable: true, example: 3 })
  pageStart: number | null;

  @ApiProperty({ required: false, nullable: true, example: 3 })
  pageEnd: number | null;

  /** The passage itself, for display beside the answer. */
  @ApiProperty()
  snippet: string;
}

/** What the answer cost. */
export class AnswerUsageDto {
  @ApiProperty({ example: 912 })
  inputTokens: number;

  @ApiProperty({ example: 64 })
  outputTokens: number;

  @ApiProperty({ example: 0.001256 })
  costUsd: number;
}

/** Body of a successful `POST /ask`. */
export class AskResponseDto {
  /**
   * The answer, with citation markers like `[1]` placed after the claims they
   * support. A marker the model invented has been removed.
   */
  @ApiProperty({
    example: 'Call POST /auth/token with your client id and secret to obtain a bearer token [1].',
  })
  answer: string;

  /** The passages the answer drew on, in the order they are first cited. */
  @ApiProperty({ type: [CitationDto] })
  citations: CitationDto[];

  @ApiProperty({ type: AnswerUsageDto })
  usage: AnswerUsageDto;
}
