import { describeGuards } from './describe-guards.js';
import { type Env } from './env.schema.js';

const base = {
  DEMO_API_KEY: '',
  DAILY_BUDGET_USD: 0,
  RATE_LIMIT_ENABLED: true,
  MAX_DOCUMENTS: 0,
  MAX_UPLOAD_MB: 20,
  TRUST_PROXY: false,
} as Env;

const envWith = (overrides: Partial<Env>): Env => ({ ...base, ...overrides });

describe('describeGuards', () => {
  it('AC20: shouts when the API is open, rather than reporting an empty string', () => {
    // The state worth tripping over while skimming a startup log.
    expect(describeGuards(base)).toContain('demo key OPEN');
  });

  it('AC20: shouts when there is no spend ceiling', () => {
    expect(describeGuards(base)).toContain('spend ceiling NONE');
  });

  it('AC20: shouts when rate limits are off', () => {
    expect(describeGuards(envWith({ RATE_LIMIT_ENABLED: false }))).toContain('rate limits OFF');
  });

  it('AC20: reports a configured deployment quietly', () => {
    const line = describeGuards(
      envWith({ DEMO_API_KEY: 'secret', DAILY_BUDGET_USD: 0.5, MAX_DOCUMENTS: 50 }),
    );

    expect(line).toContain('demo key required');
    expect(line).toContain('spend ceiling $0.50/day');
    expect(line).toContain('corpus <= 50 documents');
    expect(line).not.toMatch(/OPEN|NONE|OFF/);
  });

  it('AC7: never puts the key itself in the log', () => {
    // The line exists to be read in a terminal, a CI log and a log sink. The
    // key must not be in any of them.
    expect(describeGuards(envWith({ DEMO_API_KEY: 'super-secret-value' }))).not.toContain(
      'super-secret-value',
    );
  });

  it('says when it is trusting a proxy for the client address', () => {
    expect(describeGuards(envWith({ TRUST_PROXY: true }))).toContain('trusting one proxy');
    expect(describeGuards(base)).not.toContain('proxy');
  });

  it('names the upload limit, because it is the one people change and forget', () => {
    expect(describeGuards(envWith({ MAX_UPLOAD_MB: 5 }))).toContain('uploads <= 5 MB');
  });
});
