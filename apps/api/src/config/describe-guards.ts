import { type Env } from './env.schema.js';

/**
 * One line saying which protections this process is running with.
 *
 * Logged at boot, because the failure worth catching is a deployment that is
 * missing one — and the alternative way to find out is the bill.
 *
 * Phrased so the dangerous states are the loud ones: a reader skimming a
 * startup log should trip over `demo key OPEN`, not have to notice that a
 * number is zero.
 *
 * @param env Validated configuration.
 * @returns The line to log.
 *
 * @example
 * ```
 * guards: demo key OPEN, spend ceiling NONE, rate limits on, corpus unlimited, uploads <= 20 MB
 * ```
 */
export function describeGuards(env: Env): string {
  return [
    'guards:',
    `demo key ${env.DEMO_API_KEY === '' ? 'OPEN' : 'required'},`,
    `spend ceiling ${env.DAILY_BUDGET_USD > 0 ? `$${env.DAILY_BUDGET_USD.toFixed(2)}/day` : 'NONE'},`,
    `rate limits ${env.RATE_LIMIT_ENABLED ? 'on' : 'OFF'},`,
    `corpus ${env.MAX_DOCUMENTS > 0 ? `<= ${String(env.MAX_DOCUMENTS)} documents` : 'unlimited'},`,
    `uploads <= ${String(env.MAX_UPLOAD_MB)} MB`,
    env.TRUST_PROXY ? ', trusting one proxy for the client address' : '',
  ]
    .join(' ')
    .trimEnd();
}
