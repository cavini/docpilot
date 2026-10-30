import { type HealthResponse } from '@docpilot/shared';
import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { type Response } from 'express';

import { HealthResponseDto } from './health.response.js';
import { HealthService } from './health.service.js';

/** Liveness and readiness for the API and its dependencies. */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * Reports the health of the API and of Postgres, Redis and document storage.
   *
   * Returns 200 when everything is usable and 503 when any dependency is down,
   * so a load balancer or container orchestrator can act on the status code
   * alone, while the body says which dependency is at fault.
   */
  @Get()
  @ApiOperation({ summary: 'Health of the API and its dependencies' })
  @ApiOkResponse({ description: 'Every dependency is usable', type: HealthResponseDto })
  @ApiServiceUnavailableResponse({
    description: 'At least one dependency is down',
    type: HealthResponseDto,
  })
  async check(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    const result = await this.health.check();

    response.status(result.status === 'down' ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK);

    return result;
  }

  /**
   * Reports only that the process is running and able to answer.
   *
   * Separate from the full check because a container orchestrator restarting
   * the process helps when the process is wedged, and does not help when
   * Postgres is down. Probing dependencies from a liveness check turns one
   * failing dependency into a restart loop across every replica.
   */
  @Get('live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness only, with no dependency probes' })
  @ApiOkResponse({ description: 'The process is running' })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
