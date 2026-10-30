import { type DependencyHealth, type HealthStatus } from './health.schema.js';

/**
 * Severity order used to roll several dependency statuses into one. A higher
 * number is worse.
 */
const SEVERITY: Record<HealthStatus, number> = {
  ok: 0,
  degraded: 1,
  down: 2,
};

/**
 * Reduces the statuses of every dependency to a single status for the
 * application, by taking the worst one.
 *
 * The application is only as healthy as its least healthy dependency, so one
 * unreachable database makes the whole API `down` even if everything else
 * answers. An empty list reports `ok`: nothing was probed, so nothing is known
 * to be broken.
 *
 * @param dependencies Results of probing each dependency.
 * @returns The worst status present, or `ok` when there is nothing to report.
 *
 * @example
 * ```ts
 * rollUpHealthStatus([{ status: 'ok' }, { status: 'down' }]); // 'down'
 * ```
 */
export function rollUpHealthStatus(dependencies: readonly DependencyHealth[]): HealthStatus {
  let worst: HealthStatus = 'ok';

  for (const dependency of dependencies) {
    if (SEVERITY[dependency.status] > SEVERITY[worst]) {
      worst = dependency.status;
    }
  }

  return worst;
}
