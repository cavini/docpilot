import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { type FeatureFlagState, FeatureFlagsService } from './feature-flags.service.js';

/** Read-only view of which capabilities are enabled. */
@ApiTags('feature-flags')
@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  /**
   * Lists every feature flag and whether it is on.
   *
   * The web app reads this at startup so it can hide controls for capabilities
   * the server will refuse, instead of letting the user press a button that
   * returns an error.
   */
  @Get()
  @ApiOperation({ summary: 'List feature flags and their current values' })
  @ApiOkResponse({ description: 'Every flag with its current value' })
  list(): FeatureFlagState[] {
    return this.flags.all();
  }
}
