import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { pipeUIMessageStreamToResponse } from 'ai';
import { type Request, type Response } from 'express';

import { ChatRequestDto } from '../chat/chat.dto.js';
import { ApiErrors } from '../common/http/api-errors.decorator.js';
import { AgentService } from './agent.service.js';
import { AnswerRateLimit } from '../rate-limit/index.js';

/** Answers that may involve calling tools. */
@ApiTags('agent')
@AnswerRateLimit()
@Controller('agent')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  /**
   * Answers a question, calling tools where they help.
   *
   * Same request and response shape as [`/chat`](../chat/chat.controller.ts),
   * so a client can switch between them by changing a path. What differs is
   * the stream's contents: tool parts appear as the model calls them, and a
   * `tool-approval-request` where the reader has to answer before anything
   * irreversible happens.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Answer a question, calling tools where they help' })
  @ApiBody({ type: ChatRequestDto })
  @ApiResponse({
    status: 200,
    description:
      'A UI message stream (text/event-stream). Carries the same parts as /chat, plus ' +
      'the SDK tool parts and a tool-approval-request where approval is needed.',
    content: { 'text/event-stream': { schema: { type: 'string' } } },
  })
  @ApiErrors(400, 404, 503)
  async run(
    @Body() body: ChatRequestDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const { id } = request as Request & { id?: unknown };
    const controller = new AbortController();

    // Cancels the loop when the client goes away. Without this a reader
    // closing the tab leaves the model running, and an agent turn can be
    // several model calls.
    request.on('close', () => {
      controller.abort();
    });

    const stream = await this.agent.stream({
      question: body.question,
      ...(body.conversationId === undefined ? {} : { conversationId: body.conversationId }),
      ...(body.documentIds === undefined ? {} : { documentIds: body.documentIds }),
      ...(body.messages === undefined ? {} : { resumeFrom: body.messages }),
      ...(typeof id === 'string' ? { requestId: id } : {}),
      signal: controller.signal,
    });

    await pipeUIMessageStreamToResponse({ response, stream });
  }
}
