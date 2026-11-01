import { SCHEMA_NAMES, schemaEntry } from '@docpilot/shared';
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request, type Response } from 'express';

import { ApiErrors } from '../common/http/api-errors.decorator.js';
import { ExtractRequestDto, ExtractionResponseDto, SchemaListDto } from './extraction.dto.js';
import { ExtractionService } from './extraction.service.js';
import { AnswerRateLimit } from '../rate-limit/index.js';

/** Extracting structured data from the corpus. */
@ApiTags('extraction')
@Controller('extract')
export class ExtractionController {
  constructor(private readonly extraction: ExtractionService) {}

  /**
   * Lists what the server can extract.
   *
   * The fields come from the schema rather than from the client, so adding a
   * schema needs no front-end release — a chooser and a table can both be
   * built from this.
   */
  @Get('schemas')
  @ApiOperation({ summary: 'List the schemas this server can extract' })
  @ApiOkResponse({ type: SchemaListDto })
  schemas(): SchemaListDto {
    return {
      schemas: SCHEMA_NAMES.map((name) => {
        const entry = schemaEntry(name);

        return {
          name,
          title: entry.title,
          description: entry.description,
          fields: entry.fields.map((field) => ({
            name: field.name,
            kind: field.kind,
            label: field.label,
            ...(field.options === undefined ? {} : { options: [...field.options] }),
          })),
        };
      }),
    };
  }

  /** Extracts the named schema from the corpus. */
  @AnswerRateLimit()
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Extract structured data using a named schema' })
  @ApiOkResponse({ type: ExtractionResponseDto })
  @ApiErrors(400, 503)
  async extract(
    @Body() body: ExtractRequestDto,
    @Req() request: Request,
  ): Promise<ExtractionResponseDto> {
    const { id } = request as Request & { id?: unknown };

    return this.extraction.extract({
      schema: body.schema,
      ...(body.documentId === undefined ? {} : { documentId: body.documentId }),
      ...(body.query === undefined ? {} : { query: body.query }),
      ...(typeof id === 'string' ? { requestId: id } : {}),
    });
  }

  /**
   * Extracts, sending each item as it completes.
   *
   * A hand-rolled event shape rather than the AI SDK's UI message stream:
   * this is not a chat, there is no message to assemble, and a caller
   * consuming it with `EventSource` should not have to understand a protocol
   * built for conversation.
   *
   * Validation failures before the stream opens are ordinary JSON errors with
   * real status codes. Once it is open the status is already 200, so a
   * failure can only be an `error` event inside it.
   */
  @AnswerRateLimit()
  @Post('stream')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Extract structured data, one item at a time' })
  @ApiResponse({
    status: 200,
    description:
      'Server-sent events: one `schema` event, then an `item` event per extracted item, ' +
      'then `done` — or `error` if it ended early.',
    content: { 'text/event-stream': { schema: { type: 'string' } } },
  })
  @ApiErrors(400, 503)
  async extractStream(
    @Body() body: ExtractRequestDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const { id } = request as Request & { id?: unknown };

    const events = this.extraction.stream({
      schema: body.schema,
      ...(body.documentId === undefined ? {} : { documentId: body.documentId }),
      ...(body.query === undefined ? {} : { query: body.query }),
      ...(typeof id === 'string' ? { requestId: id } : {}),
    });

    // The first event is produced before anything is written, so an unknown
    // schema still throws into the exception filter and becomes a 400 rather
    // than a 200 with an error inside it.
    const first = await events.next();

    response.writeHead(HttpStatus.OK, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      // Stops a proxy buffering the stream into one response, which would
      // defeat the whole point.
      'x-accel-buffering': 'no',
    });

    if (!first.done) {
      response.write(`data: ${JSON.stringify(first.value)}\n\n`);
    }

    for await (const event of events) {
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    response.write('data: [DONE]\n\n');
    response.end();
  }
}
