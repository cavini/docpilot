import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Must match the path in `global-setup.ts`; see the note there. */
const CONTAINER_INFO_PATH = join(tmpdir(), 'docpilot-test-containers.json');

/** Stops the shared containers and removes the details file. */
export default async function globalTeardown(): Promise<void> {
  const containers = globalThis.__DOCPILOT_CONTAINERS__;

  if (containers) {
    await Promise.all([
      containers.postgres.stop(),
      containers.redis.stop(),
      containers.localstack.stop(),
    ]);
  }

  rmSync(CONTAINER_INFO_PATH, { force: true });
}
