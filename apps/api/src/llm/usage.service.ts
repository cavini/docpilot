import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { type Database } from '../db/database.type.js';
import { DATABASE } from '../db/db.tokens.js';
import { llmUsage } from '../db/schema/index.js';
import { calculateCost, hasKnownPrice } from './pricing.js';

/** One model call worth recording. */
export interface UsageRecord {
  operation: 'embed' | 'chat' | 'agent' | 'structured' | 'eval';
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens?: number;
  latencyMs?: number;
  requestId?: string;
  /** Whether the result came from cache, so cost analysis can net it out. */
  cached?: boolean;
}

/**
 * Records what every model call cost.
 *
 * Written for every call, so "what did this cost" and "why did this get slow"
 * are questions the database can answer rather than questions for a provider
 * dashboard that only aggregates.
 */
@Injectable()
export class UsageService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UsageService.name);
  }

  /**
   * Records one call.
   *
   * Never throws. Accounting is important, but losing an answer the user was
   * waiting for because the ledger write failed would be worse than losing the
   * ledger row, so a failure is logged and swallowed.
   *
   * @param record What was spent.
   */
  async record(record: UsageRecord): Promise<void> {
    const outputTokens = record.outputTokens ?? 0;
    const costUsd = calculateCost(record.provider, record.model, record.inputTokens, outputTokens);

    if (!hasKnownPrice(record.provider, record.model) && record.provider !== 'mock') {
      // Recorded at zero rather than dropped, but said out loud so the gap in
      // the pricing table gets noticed rather than quietly skewing totals.
      this.logger.warn(
        { provider: record.provider, model: record.model },
        'no price known for this model; usage recorded at zero cost',
      );
    }

    try {
      await this.db.insert(llmUsage).values({
        operation: record.operation,
        provider: record.provider,
        model: record.model,
        inputTokens: record.inputTokens,
        outputTokens,
        costUsd: costUsd.toFixed(6),
        cached: record.cached === true ? 1 : 0,
        ...(record.latencyMs === undefined ? {} : { latencyMs: record.latencyMs }),
        ...(record.requestId === undefined ? {} : { requestId: record.requestId }),
      });
    } catch (error) {
      this.logger.error({ err: error, operation: record.operation }, 'failed to record llm usage');
    }
  }
}
