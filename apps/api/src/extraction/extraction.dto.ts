import { SCHEMA_NAMES } from '@docpilot/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/** Body of `POST /extract` and `POST /extract/stream`. */
export class ExtractRequestDto {
  /** Name of a schema the server knows. */
  @ApiProperty({ enum: SCHEMA_NAMES, example: 'api_endpoints' })
  @IsString()
  @MinLength(1)
  schema: string;

  /** Restrict extraction to one document. Omit to read the whole corpus. */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  documentId?: string;

  /** What to look for. Omit to use the schema's own default. */
  @ApiPropertyOptional({ example: 'authentication endpoints' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  query?: string;
}

/** One column of an extraction result. */
export class SchemaFieldDto {
  @ApiProperty()
  name: string;

  @ApiProperty({ enum: ['string', 'text', 'enum', 'boolean', 'number'] })
  kind: string;

  @ApiProperty({ description: 'Column heading, in English. Clients translate by `name`.' })
  label: string;

  @ApiProperty({ required: false, type: [String], description: 'Allowed values, for an enum.' })
  options?: string[];
}

/** One schema the server can extract. */
export class SchemaSummaryDto {
  @ApiProperty({ enum: SCHEMA_NAMES })
  name: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ type: [SchemaFieldDto], description: 'What a table of this shape renders.' })
  fields: SchemaFieldDto[];
}

/** Everything the server can extract. */
export class SchemaListDto {
  @ApiProperty({ type: [SchemaSummaryDto] })
  schemas: SchemaSummaryDto[];
}

/** A passage an extraction drew on. */
export class ExtractionCitationDto {
  @ApiProperty()
  n: number;

  @ApiProperty({ format: 'uuid' })
  chunkId: string;

  @ApiProperty({ format: 'uuid' })
  documentId: string;

  @ApiProperty()
  documentTitle: string;

  @ApiProperty({ required: false, nullable: true })
  headingPath: string | null;
}

/** What one extraction cost. */
export class ExtractionUsageDto {
  @ApiProperty()
  inputTokens: number;

  @ApiProperty()
  outputTokens: number;

  @ApiProperty()
  costUsd: number;
}

/** The result of an extraction. */
export class ExtractionResponseDto {
  @ApiProperty({ enum: SCHEMA_NAMES })
  schema: string;

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: 'Items validated against the named schema.',
  })
  items: unknown[];

  @ApiProperty({ type: [ExtractionCitationDto] })
  citations: ExtractionCitationDto[];

  @ApiProperty({ description: 'Items the model produced that failed validation and were dropped.' })
  dropped: number;

  @ApiProperty({
    description: 'Whether the first attempt failed validation and had to be repaired.',
  })
  repaired: boolean;

  @ApiProperty({ type: ExtractionUsageDto })
  usage: ExtractionUsageDto;
}
