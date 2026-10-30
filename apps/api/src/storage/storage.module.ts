import { Global, Module } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';

import { type Env } from '../config/env.schema.js';
import { ENV } from '../config/env.tokens.js';
import { StorageProbe } from './storage-probe.service.js';
import { S3_CLIENT } from './storage.tokens.js';

/**
 * Owns the connection to document storage.
 *
 * The client is built from configuration rather than from AWS's default
 * credential chain, so the same code reaches a local emulator, a self-hosted
 * S3-compatible store, or real AWS depending only on `S3_ENDPOINT` and
 * `S3_FORCE_PATH_STYLE`.
 *
 * In M0 this module exists to let the health check prove storage is reachable.
 * The read and write API arrives with the ingestion pipeline.
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
    StorageProbe,
  ],
  exports: [S3_CLIENT, StorageProbe],
})
export class StorageModule {}
