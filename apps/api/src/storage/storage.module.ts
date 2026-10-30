import { S3Client } from '@aws-sdk/client-s3';
import { Global, Module } from '@nestjs/common';

import { type Env } from '../config/env.schema.js';
import { ENV } from '../config/env.tokens.js';
import { LocalStorage } from './local.storage.js';
import { S3Storage } from './s3.storage.js';
import { StorageService } from './storage.service.js';
import { S3_CLIENT } from './storage.tokens.js';

/**
 * Owns document storage.
 *
 * The client is built from configuration rather than from AWS's default
 * credential chain, so the same code reaches a local emulator, a self-hosted
 * S3-compatible store, or real AWS depending only on `S3_ENDPOINT` and
 * `S3_FORCE_PATH_STYLE`. The driver is chosen once, here, so nothing
 * downstream branches on which one is in use.
 */
@Global()
@Module({
  providers: [
    {
      provide: S3_CLIENT,
      inject: [ENV],
      useFactory: (env: Env) =>
        new S3Client({
          region: env.S3_REGION,
          // An empty endpoint means real AWS, where the SDK derives the host
          // from the region.
          ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
          forcePathStyle: env.S3_FORCE_PATH_STYLE,
          credentials: {
            accessKeyId: env.AWS_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
          },
          maxAttempts: 2,
        }),
    },
    S3Storage,
    LocalStorage,
    {
      provide: StorageService,
      inject: [ENV, S3Storage, LocalStorage],
      useFactory: (env: Env, s3: S3Storage, local: LocalStorage): StorageService =>
        env.STORAGE_DRIVER === 'local' ? local : s3,
    },
  ],
  exports: [StorageService, S3_CLIENT],
})
export class StorageModule {}
