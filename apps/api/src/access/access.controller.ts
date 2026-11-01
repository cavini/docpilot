import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { BudgetService } from '../budget/index.js';
import { type Env } from '../config/env.schema.js';
import { ENV } from '../config/env.tokens.js';
import { AccessResponseDto } from './access.dto.js';

/**
 * Where a client checks a key before storing it.
 *
 * Guarded like everything else, so a wrong key is a 401 from the guard and
 * never reaches this handler. What it adds is the state a client needs to
 * render honestly once it is in: whether a key was needed at all, and whether
 * today's answers will be canned.
 */
@ApiTags('access')
@Controller('access')
export class AccessController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly budget: BudgetService,
  ) {}

  /**
   * Confirms the key and reports the demo's state.
   *
   * @returns Whether a key is required, and whether the budget is spent.
   */
  @Get()
  @ApiOperation({ summary: 'Check the demo key and read the demo state' })
  @ApiOkResponse({ type: AccessResponseDto })
  @ApiUnauthorizedResponse({ description: 'The key is missing or wrong' })
  async check(): Promise<AccessResponseDto> {
    const budget = await this.budget.status();

    return {
      ok: true,
      keyRequired: this.env.DEMO_API_KEY !== '',
      budget: {
        spent: budget.exhausted,
        resetsAt: budget.resetsAt?.toISOString() ?? null,
      },
    };
  }
}
