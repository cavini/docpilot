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

/**
 * Most messages a resumed turn may carry.
 *
 * A turn is one question and the steps it took, not a whole conversation, so
 * this is generous. The bound exists because the array is client-supplied.
 */
const MAX_RESUME_MESSAGES = 50;

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

  /**
   * The turn so far, when resuming one that paused for approval.
   *
   * `/agent` only. Sent by the AI SDK client when it answers an approval,
   * because that answer lives inside the message parts and there is nowhere
   * else to carry it.
   *
   * Used **only** to resume the paused tool loop. The conversation's own
   * history still comes from the server's store, so a client cannot rewrite
   * what was said by editing this — the worst it can do is mis-resume its own
   * in-flight turn.
   */
  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: 'The turn so far, when resuming one that paused for approval.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_RESUME_MESSAGES)
  messages?: unknown[];
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
