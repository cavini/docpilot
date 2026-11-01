import { Global, Module } from '@nestjs/common';

import { BudgetService } from './budget.service.js';

/**
 * The spend ceiling, available everywhere.
 *
 * Global because every path that can call a model has to ask: answering,
 * extracting, the agent's tools and ingestion. Importing it into each of
 * those modules would be the same statement written six times.
 */
@Global()
@Module({ providers: [BudgetService], exports: [BudgetService] })
export class BudgetModule {}
