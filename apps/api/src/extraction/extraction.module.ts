import { Module } from '@nestjs/common';

import { ChatModule } from '../chat/chat.module.js';
import { RetrievalModule } from '../retrieval/retrieval.module.js';
import { ExtractionController } from './extraction.controller.js';
import { ExtractionService } from './extraction.service.js';

/**
 * Structured extraction.
 *
 * Imports `ChatModule` for the model factory rather than redeclaring it, so
 * `LLM_PROVIDER=mock` means the same thing here as everywhere else.
 */
@Module({
  imports: [ChatModule, RetrievalModule],
  controllers: [ExtractionController],
  providers: [ExtractionService],
  exports: [ExtractionService],
})
export class ExtractionModule {}
