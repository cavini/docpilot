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

/** Most documents a single question may be restricted to. */
const MAX_DOCUMENT_FILTER = 50;

/** Body of `POST /chat`. */
export class ChatRequestDto {
  /** The question to answer. */
  @ApiProperty({ example: 'How do I authenticate?' })
  @IsString()
  question: string;

  /** Conversation to continue. Omit to start one. */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  /** How many passages to retrieve. Defaults to `RETRIEVAL_TOP_K`. */
  @ApiPropertyOptional({ minimum: 1, maximum: 20, example: 8 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  topK?: number;

  /** Restrict retrieval to these documents. Omit to search everything. */
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_DOCUMENT_FILTER)
  @IsUUID('4', { each: true })
  documentIds?: string[];
}

/** One turn in a stored conversation. */
export class ConversationMessageDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: ['user', 'assistant'] })
  role: 'user' | 'assistant';

  @ApiProperty()
  content: string;

  @ApiProperty({ description: 'Position within the conversation, from zero.' })
  ordinal: number;

  @ApiProperty({
    required: false,
    nullable: true,
    enum: ['complete', 'stopped', 'failed'],
    description: 'How an assistant turn ended. Null for a question.',
  })
  outcome: 'complete' | 'stopped' | 'failed' | null;

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: 'The citations this answer carried, as they were shown at the time.',
  })
  citations: unknown[];

  @ApiProperty()
  createdAt: string;
}

/** A conversation in a list. */
export class ConversationSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ description: 'Derived from the first question.' })
  title: string;

  @ApiProperty()
  createdAt: string;

  @ApiProperty({ description: 'When it was last added to. The list sorts on this.' })
  updatedAt: string;
}

/** One page of conversations, most recently used first. */
export class ConversationPageDto {
  @ApiProperty({ type: [ConversationSummaryDto] })
  items: ConversationSummaryDto[];

  @ApiProperty({ required: false, nullable: true })
  nextCursor: string | null;
}

/** A conversation and its turns. */
export class ConversationDto extends ConversationSummaryDto {
  @ApiProperty({ type: [ConversationMessageDto] })
  messages: ConversationMessageDto[];
}
