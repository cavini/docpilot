import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { pipeUIMessageStreamToResponse } from 'ai';
import { type Request, type Response } from 'express';

import { ApiErrors } from '../common/http/api-errors.decorator.js';
import { ChatRequestDto } from './chat.dto.js';
import { ChatService } from './chat.service.js';

/** Streamed, conversational answers. */
@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  /**
   * Answers a question in a conversation, streaming as the model writes.
   *
   * The response is the AI SDK's **UI message stream** — server-sent events —
   * rather than a JSON body, so the browser renders words as they arrive. The
   * client consumes it with `useChat`, which means the wire protocol is the
   * SDK's rather than one written by hand on both sides and kept in step.
   *
   * Everything that can fail before generation starts is validated first, so
   * those failures are ordinary JSON errors with real status codes. Once the
   * stream is open the status is already 200 and a failure can only be an
   * error part inside it.
   *
   * The response object is passed to the SDK rather than returned, so Nest
   * does not try to serialise anything: `@Res()` without `passthrough` hands
   * the response over completely.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Answer a question in a conversation, streamed' })
  @ApiBody({ type: ChatRequestDto })
  @ApiResponse({
    status: 200,
    description:
      'A UI message stream (text/event-stream). Carries a `data-conversation` part first, ' +
      'a `data-citations` part before any text, then the answer.',
    content: { 'text/event-stream': { schema: { type: 'string' } } },
  })
  @ApiErrors(400, 404, 503)
  async chatStream(
    @Body() body: ChatRequestDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const { id } = request as Request & { id?: unknown };

    const stream = await this.chat.stream({
      question: body.question,
      ...(body.conversationId === undefined ? {} : { conversationId: body.conversationId }),
      ...(body.topK === undefined ? {} : { topK: body.topK }),
      ...(body.documentIds === undefined ? {} : { documentIds: body.documentIds }),
      ...(typeof id === 'string' ? { requestId: id } : {}),
      // Cancels generation when the client goes away. Without this a reader
      // closing the tab leaves the model running and billing.
      signal: abortOnDisconnect(request),
    });

    await pipeUIMessageStreamToResponse({ response, stream });
  }
}

/**
 * An abort signal that fires when the client disconnects.
 *
 * Express emits `close` on the request when the socket goes away, whether the
 * reader pressed stop, closed the tab, or lost their connection. Without this
 * the provider keeps generating — and keeps charging — for an answer nobody
 * will read.
 *
 * @param request The inbound request.
 * @returns A signal aborted on disconnect.
 */
function abortOnDisconnect(request: Request): AbortSignal {
  const controller = new AbortController();

  request.on('close', () => {
    controller.abort();
  });

  return controller.signal;
}
