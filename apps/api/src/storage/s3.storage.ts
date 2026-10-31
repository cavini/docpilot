import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { Inject, Injectable } from '@nestjs/common';

import { type Env } from '../config/env.schema.js';
import { ENV } from '../config/env.tokens.js';
import { StorageService } from './storage.service.js';
import { S3_CLIENT } from './storage.tokens.js';

/** Stores documents in S3, or anything that speaks the same protocol. */
@Injectable()
export class S3Storage extends StorageService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(S3_CLIENT) private readonly s3: S3Client,
  ) {
    super();
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.env.S3_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<Uint8Array> {
    const result = await this.s3.send(
      new GetObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }),
    );

    if (!result.Body) {
      throw new Error(`Object ${key} has no body.`);
    }

    return result.Body.transformToByteArray();
  }

  async remove(key: string): Promise<void> {
    // S3 treats deleting a missing key as success, which is the behaviour the
    // cleanup paths want.
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }));
  }

  async probe(): Promise<void> {
    // One round trip confirms the endpoint answers, the credentials are
    // accepted and the bucket exists.
    await this.s3.send(new HeadBucketCommand({ Bucket: this.env.S3_BUCKET }));
  }
}
