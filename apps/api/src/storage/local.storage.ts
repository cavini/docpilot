import { constants } from 'node:fs';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';

import { Inject, Injectable } from '@nestjs/common';

import { type Env } from '../config/env.schema.js';
import { ENV } from '../config/env.tokens.js';
import { StorageService } from './storage.service.js';

/**
 * Stores documents on local disk.
 *
 * A fallback for environments with no object store, not the normal path: it
 * does not survive a container restart and cannot be shared between replicas.
 */
@Injectable()
export class LocalStorage extends StorageService {
  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  /**
   * Resolves a key to a path inside the storage directory.
   *
   * Keys are built from document ids, so they are already safe; this check
   * exists because "already safe" is an assumption that only has to be wrong
   * once, and a path escape here writes anywhere the process can reach.
   */
  private pathFor(key: string): string {
    const root = resolve(this.env.LOCAL_STORAGE_DIR);
    const target = resolve(join(root, normalize(key)));

    if (target !== root && !target.startsWith(root + sep)) {
      throw new Error(`Storage key "${key}" escapes the storage directory.`);
    }

    return target;
  }

  async put(key: string, bytes: Uint8Array, _contentType: string): Promise<void> {
    const path = this.pathFor(key);

    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }

  async get(key: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.pathFor(key)));
  }

  async remove(key: string): Promise<void> {
    // `force` so deleting something already gone is not an error.
    await rm(this.pathFor(key), { force: true });
  }

  async probe(): Promise<void> {
    await mkdir(this.env.LOCAL_STORAGE_DIR, { recursive: true });
    await access(this.env.LOCAL_STORAGE_DIR, constants.W_OK);
  }
}
