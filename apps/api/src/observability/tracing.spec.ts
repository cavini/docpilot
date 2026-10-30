import { type Env } from '../config/env.schema.js';
import { startTracing } from './tracing.js';

const env = (overrides: Partial<Env>): Env =>
  ({
    DD_TRACE_ENABLED: false,
    DD_SERVICE: 'docpilot-api',
    DD_ENV: 'test',
    DD_VERSION: '0.0.0',
    DD_AGENT_HOST: 'localhost',
    ...overrides,
  }) as Env;

describe('startTracing', () => {
  it('AC1: does nothing when tracing is switched off', async () => {
    // The application has to behave identically with no Datadog agent present,
    // which is how it runs locally and in CI.
    await expect(startTracing(env({ DD_TRACE_ENABLED: false }))).resolves.toBeUndefined();
  });

  it('AC2: does not load the tracer when switched off', async () => {
    const before = Object.keys(require.cache).filter((path) => path.includes('dd-trace'));

    await startTracing(env({ DD_TRACE_ENABLED: false }));

    const after = Object.keys(require.cache).filter((path) => path.includes('dd-trace'));
    expect(after).toStrictEqual(before);
  });
});
