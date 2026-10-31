import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';

import { AskRequestDto, AskResponseDto } from './ask.dto.js';
import { AskService } from './ask.service.js';

/** Answering questions from the corpus. */
@ApiTags('ask')
@Controller('ask')
export class AskController {
  constructor(private readonly ask: AskService) {}

  /**
   * Answers a question from the documents, with citations.
   *
   * Non-streaming, which makes it the endpoint to use from a script, from the
   * MCP server, or from an eval run where the whole answer is wanted at once.
   * The streaming chat endpoint arrives with the interface that needs it.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Answer a question from the documents, with citations' })
  @ApiOkResponse({ description: 'The answer and its citations', type: AskResponseDto })
  async answer(@Body() body: AskRequestDto, @Req() request: Request): Promise<AskResponseDto> {
    const { id } = request as Request & { id?: unknown };

    return this.ask.ask({
      question: body.question,
      ...(body.topK === undefined ? {} : { topK: body.topK }),
      ...(body.documentIds === undefined ? {} : { documentIds: body.documentIds }),
      ...(typeof id === 'string' ? { requestId: id } : {}),
    });
  }
}
