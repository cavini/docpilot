import { Module } from '@nestjs/common';

import { IngestionModule } from '../ingestion/ingestion.module.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';

/** Uploading, listing and deleting documents. */
@Module({
  imports: [IngestionModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
