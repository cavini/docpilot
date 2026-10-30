import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { HeadBucketCommand, type S3Client } from '@aws-sdk/client-s3';

import { type Env } from '../config/env.schema.js';
import { StorageProbe } from './storage-probe.service.js';

const s3Env = {
  STORAGE_DRIVER: 's3',
  S3_BUCKET: 'docpilot-documents',
  LOCAL_STORAGE_DIR: './uploads',
} as Env;

function createS3(send = jest.fn().mockResolvedValue({})): S3Client {
  return { send } as unknown as S3Client;
}

describe('StorageProbe', () => {
  describe('with the s3 driver', () => {
    it('AC1: asks the bucket whether it exists', async () => {
      const send = jest.fn().mockResolvedValue({});
      const probe = new StorageProbe(s3Env, createS3(send));

      await probe.probe();

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]).toBeInstanceOf(HeadBucketCommand);
    });

    it('AC2: probes the configured bucket, not a hardcoded one', async () => {
      const send = jest.fn().mockResolvedValue({});
      const probe = new StorageProbe({ ...s3Env, S3_BUCKET: 'other-bucket' }, createS3(send));

      await probe.probe();

      const command = send.mock.calls[0]?.[0] as HeadBucketCommand;
      expect(command.input.Bucket).toBe('other-bucket');
    });

    it('AC3: propagates the failure so the health check can report it', async () => {
      const probe = new StorageProbe(
        s3Env,
        createS3(jest.fn().mockRejectedValue(new Error('NoSuchBucket'))),
      );

      await expect(probe.probe()).rejects.toThrow('NoSuchBucket');
    });
  });

  describe('with the local driver', () => {
    let directory: string;

    beforeEach(async () => {
      directory = await mkdtemp(join(tmpdir(), 'docpilot-storage-'));
    });

    afterEach(async () => {
      await rm(directory, { recursive: true, force: true });
    });

    it('AC4: succeeds when the upload directory is writable', async () => {
      const send = jest.fn();
      const probe = new StorageProbe(
        { ...s3Env, STORAGE_DRIVER: 'local', LOCAL_STORAGE_DIR: directory },
        createS3(send),
      );

      await expect(probe.probe()).resolves.toBeUndefined();
      // The local driver must not reach for S3 at all.
      expect(send).not.toHaveBeenCalled();
    });

    it('AC5: creates the upload directory when it does not exist yet', async () => {
      const nested = join(directory, 'nested', 'uploads');
      const probe = new StorageProbe(
        { ...s3Env, STORAGE_DRIVER: 'local', LOCAL_STORAGE_DIR: nested },
        createS3(),
      );

      await expect(probe.probe()).resolves.toBeUndefined();
    });
  });
});
