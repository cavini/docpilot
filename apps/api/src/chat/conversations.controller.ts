import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiErrors } from '../common/http/api-errors.decorator.js';
import { type ConversationRow, type MessageRow } from '../db/schema/index.js';
import {
  ConversationDto,
  ConversationPageDto,
  type ConversationMessageDto,
  type ConversationSummaryDto,
} from './chat.dto.js';
import { ConversationsService } from './conversations.service.js';

/** Maps a stored conversation to its published shape. */
function toSummary(row: ConversationRow): ConversationSummaryDto {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Maps a stored message to its published shape. */
function toMessage(row: MessageRow): ConversationMessageDto {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    ordinal: row.ordinal,
    outcome: row.outcome,
    citations: row.citations,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Listing, resuming and deleting conversations. */
@ApiTags('conversations')
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  /** Lists conversations, most recently used first. */
  @Get()
  @ApiOperation({ summary: 'List conversations, most recently used first' })
  @ApiOkResponse({ type: ConversationPageDto })
  async list(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<ConversationPageDto> {
    const page = await this.conversations.list({
      ...(limit === undefined ? {} : { limit: Number.parseInt(limit, 10) }),
      ...(cursor === undefined ? {} : { cursor }),
    });

    return { items: page.items.map(toSummary), nextCursor: page.nextCursor };
  }

  /** Reads one conversation and its turns, oldest first. */
  @Get(':id')
  @ApiOperation({ summary: 'Read a conversation and its turns' })
  @ApiOkResponse({ type: ConversationDto })
  @ApiErrors(404)
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<ConversationDto> {
    const { conversation, messages } = await this.conversations.get(id);

    const summary = toSummary(conversation);

    return {
      id: summary.id,
      title: summary.title,
      createdAt: summary.createdAt,
      updatedAt: summary.updatedAt,
      messages: messages.map(toMessage),
    };
  }

  /** Deletes a conversation and its turns. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a conversation and its turns' })
  @ApiNoContentResponse({ description: 'The conversation is gone' })
  @ApiErrors(404)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.conversations.remove(id);
  }
}
