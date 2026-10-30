import { type Env } from '../config/env.schema.js';

/**
 * Starts Datadog tracing when it is switched on.
 *
 * Tracing has to be initialised before the modules it instruments are loaded,
 * which is why this runs at the very top of the entrypoint and imports
 * `dd-trace` dynamically rather than at module scope.
 *
 * It is off by default and does nothing without `DD_TRACE_ENABLED=true`,
 * because the tracer expects a local agent to send spans to: enabling it with
 * no agent produces a stream of connection warnings and no traces. The
 * application behaves identically either way, so local development and CI need
 * no Datadog account.
 *
 * @param env Validated configuration.
 *
 * @example
 * ```ts
 * const env = loadEnv();
 * await startTracing(env); // before any other import is evaluated
 * ```
 */
export async function startTracing(env: Env): Promise<void> {
  if (!env.DD_TRACE_ENABLED) {
    return;
  }

  const { default: tracer } = await import('dd-trace');

  tracer.init({
    service: env.DD_SERVICE,
    env: env.DD_ENV,
    version: env.DD_VERSION,
    hostname: env.DD_AGENT_HOST,
    // Correlates log lines with the trace that produced them, which is the
    // whole point of running both.
    logInjection: true,
    runtimeMetrics: true,
  });
}
