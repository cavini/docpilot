import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { type Response } from 'express';

import { InvalidRequestError } from '../common/errors/index.js';
import { toDocumentResponse } from './document.mapper.js';
import { DocumentsService } from './documents.service.js';
import { DocumentPageDto, DocumentResponseDto } from './documents.response.js';
import { type UploadedFile as UploadedFileShape } from './upload-validation.js';

/** Uploading documents and following their ingestion. */
@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  /**
   * Uploads a document and queues it for ingestion.
   *
   * Answers 201 for a new document and **200** when the same bytes were
   * already uploaded, returning the existing one. That makes upload
   * idempotent: a client can retry a failed request, or a user can drag the
   * same file in twice, and simply use the document that comes back.
   */
  @Post()
  @ApiOperation({ summary: 'Upload a PDF, Markdown or plain text document' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ description: 'The document was accepted', type: DocumentResponseDto })
  @ApiOkResponse({
    description: 'These bytes were already uploaded; the existing document is returned',
    type: DocumentResponseDto,
  })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: UploadedFileShape | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<DocumentResponseDto> {
    if (!file) {
      throw new InvalidRequestError('No file was uploaded. Send one under the "file" field.');
    }

    const result = await this.documents.upload(file);

    response.status(result.deduplicated ? HttpStatus.OK : HttpStatus.CREATED);

    return toDocumentResponse(result.document);
  }

  /** Lists documents, newest first. */
  @Get()
  @ApiOperation({ summary: 'List documents, newest first' })
  @ApiOkResponse({ type: DocumentPageDto })
  async list(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<DocumentPageDto> {
    const page = await this.documents.list({
      ...(limit === undefined ? {} : { limit: Number.parseInt(limit, 10) }),
      ...(cursor === undefined ? {} : { cursor }),
    });

    return { items: page.items.map(toDocumentResponse), nextCursor: page.nextCursor };
  }

  /** Reads one document, including its ingestion status. */
  @Get(':id')
  @ApiOperation({ summary: 'Read one document and its ingestion status' })
  @ApiOkResponse({ type: DocumentResponseDto })
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<DocumentResponseDto> {
    return toDocumentResponse(await this.documents.get(id));
  }

  /** Deletes a document, its chunks and its stored original. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a document and everything derived from it' })
  @ApiNoContentResponse({ description: 'The document is gone' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.documents.remove(id);
  }

  /**
   * Queues a failed document to be processed again.
   *
   * Only a failed document can be retried; retrying one that is queued or
   * already ready would duplicate work or discard a good result.
   */
  @Post(':id/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Reprocess a document that failed' })
  @ApiOkResponse({ type: DocumentResponseDto })
  async retry(@Param('id', ParseUUIDPipe) id: string): Promise<DocumentResponseDto> {
    return toDocumentResponse(await this.documents.retry(id));
  }
}
