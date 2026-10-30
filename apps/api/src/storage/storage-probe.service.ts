import { constants } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';

import { HeadBucketCommand, type S3Client } from '@aws-sdk/client-s3';
import { Inject, Injectable } from '@nestjs/common';

import { type Env } from '../config/env.schema.js';
import { ENV } from '../config/env.tokens.js';
import { S3_CLIENT } from './storage.tokens.js';

/**
 * Checks that document storage is usable.
 *
 * Kept separate from reading and writing documents so the health check has a
 * cheap, side-effect-free probe it can run every few seconds.
 */
@Injectable()
export class StorageProbe {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(S3_CLIENT) private readonly s3: S3Client,
  ) {}

  /**
   * Verifies that the configured storage backend can be reached and written
   * to.
   *
   * For the `s3` driver this is a `HeadBucket` call, which confirms in one
   * round trip that the endpoint answers, the credentials are accepted and the
   * bucket exists. For the `local` driver it confirms the upload directory
   * exists and is writable, creating it if necessary.
   *
   * @throws If storage is unreachable, misconfigured, or not writable. The
   *   caller turns that into a `down` health status.
   */
  async probe(): Promise<void> {
    if (this.env.STORAGE_DRIVER === 'local') {
      await mkdir(this.env.LOCAL_STORAGE_DIR, { recursive: true });
      await access(this.env.LOCAL_STORAGE_DIR, constants.W_OK);
      return;
    }

    await this.s3.send(new HeadBucketCommand({ Bucket: this.env.S3_BUCKET }));
  }
}
