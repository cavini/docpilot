import { Global, Module } from '@nestjs/common';

import { FeatureFlagsController } from './feature-flags.controller.js';
import { FeatureFlagsService } from './feature-flags.service.js';

/**
 * Makes feature flags readable everywhere.
 *
 * Global because guards, services and resolvers across the application consult
 * flags, and threading an import through each feature module adds noise.
 */
@Global()
@Module({
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
