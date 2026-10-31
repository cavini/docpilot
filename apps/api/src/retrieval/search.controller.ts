import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RetrievalService } from './retrieval.service.js';
import { SearchRequestDto, SearchResponseDto } from './search.dto.js';

/** Searching the corpus directly, without asking a model to answer. */
@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly retrieval: RetrievalService) {}

  /**
   * Searches the corpus and returns ranked passages.
   *
   * Exposed in its own right rather than only as a step inside answering,
   * because it is what makes a bad answer diagnosable: the per-method ranks in
   * each result show whether retrieval found the right passage and the model
   * ignored it, or retrieval never surfaced it at all. It is also the tool the
   * MCP server exposes to an editor.
   *
   * A POST rather than a GET: a question can be long enough to be awkward in a
   * URL, and putting user text in a query string puts it in access logs.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Search the corpus with hybrid retrieval' })
  @ApiOkResponse({ description: 'Ranked passages', type: SearchResponseDto })
  async search(@Body() body: SearchRequestDto): Promise<SearchResponseDto> {
    const result = await this.retrieval.search({
      query: body.query,
      ...(body.topK === undefined ? {} : { topK: body.topK }),
      ...(body.documentIds === undefined ? {} : { documentIds: body.documentIds }),
    });

    return { results: result.results, tookMs: result.tookMs, cached: result.cached };
  }
}
