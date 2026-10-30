import { Global, Module } from '@nestjs/common';

import { EmbedderService } from './embedder.service.js';
import { UsageService } from './usage.service.js';

/**
 * Access to model providers, and the ledger of what they cost.
 *
 * Global because embedding happens during ingestion, answering happens during
 * chat, and both record usage; threading an import through each would add
 * noise without adding safety.
 */
@Global()
@Module({
  providers: [EmbedderService, UsageService],
  exports: [EmbedderService, UsageService],
})
export class LlmModule {}
