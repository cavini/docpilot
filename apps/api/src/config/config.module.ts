import { Global, Module } from '@nestjs/common';

import { ENV } from './env.tokens.js';
import { loadEnv } from './load-env.js';

/**
 * Makes the validated environment injectable everywhere.
 *
 * Global because almost every module needs configuration, and threading an
 * import through each one adds noise without adding safety.
 */
@Global()
@Module({
  providers: [
    {
      provide: ENV,
      useFactory: () => loadEnv(),
    },
  ],
  exports: [ENV],
})
export class ConfigModule {}
