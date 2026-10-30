import { type DependencyHealth } from '@docpilot/shared';

/** How long a single dependency probe may take before it counts as down. */
export const PROBE_TIMEOUT_MS = 2_000;

/** Rejects after `timeoutMs`, so one hung dependency cannot hang the probe. */
function rejectAfter(timeoutMs: number): { promise: Promise<never>; cancel: () => void } {
  let timer: NodeJS.Timeout;

  const promise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`probe did not answer within ${String(timeoutMs)}ms`));
    }, timeoutMs);
  });

  return {
    promise,
    cancel: () => {
      clearTimeout(timer);
    },
  };
}

/**
 * Runs one dependency probe and turns its outcome into a health result.
 *
 * A probe that throws, or that takes longer than `timeoutMs`, reports `down`
 * with the reason. The timeout matters: an unreachable host often leaves a
 * socket hanging rather than refusing the connection, and without a bound the
 * health endpoint would hang exactly when it is most needed.
 *
 * Only the error's message is kept, never a stack or a cause chain, because
 * this value is returned to clients and a driver error can quote the
 * connection string it failed on.
 *
 * @param probe Operation that resolves when the dependency is usable.
 * @param timeoutMs Budget for the probe.
 * @returns The dependency's status, with the round trip time when it answered.
 *
 * @example
 * ```ts
 * await runProbe(() => pool.query('select 1'));
 * // { status: 'ok', latencyMs: 3 }
 * ```
 */
export async function runProbe(
  probe: () => Promise<unknown>,
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<DependencyHealth> {
  const startedAt = Date.now();
  const timeout = rejectAfter(timeoutMs);

  try {
    await Promise.race([probe(), timeout.promise]);
    return { status: 'ok', latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      status: 'down',
      error: error instanceof Error ? error.message : 'probe failed',
    };
  } finally {
    timeout.cancel();
  }
}
