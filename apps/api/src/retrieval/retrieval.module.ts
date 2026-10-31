import { Module } from '@nestjs/common';

import { QueryCacheService } from './query-cache.service.js';
import { RetrievalService } from './retrieval.service.js';
import { SearchController } from './search.controller.js';

/** Hybrid search over the corpus. */
@Module({
  controllers: [SearchController],
  providers: [RetrievalService, QueryCacheService],
  exports: [RetrievalService, QueryCacheService],
})
export class RetrievalModule {}
