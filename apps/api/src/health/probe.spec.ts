import { runProbe } from './probe.js';

describe('runProbe', () => {
  it('AC1: reports ok when the probe resolves', async () => {
    const result = await runProbe(() => Promise.resolve('pong'));

    expect(result.status).toBe('ok');
  });

  it('AC2: measures how long a successful probe took', async () => {
    const result = await runProbe(() => Promise.resolve(null));

    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });

  it('AC3: reports down with the reason when the probe rejects', async () => {
    const result = await runProbe(() => Promise.reject(new Error('connection refused')));

    expect(result).toStrictEqual({ status: 'down', error: 'connection refused' });
  });

  it('AC4: reports down when the probe exceeds its timeout', async () => {
    const neverSettles = () => new Promise(() => undefined);

    const result = await runProbe(neverSettles, 10);

    expect(result.status).toBe('down');
    expect(result.error).toContain('did not answer within 10ms');
  });

  it('AC5: reports down when the probe throws synchronously', async () => {
    const result = await runProbe(() => {
      throw new Error('bad configuration');
    });

    expect(result).toStrictEqual({ status: 'down', error: 'bad configuration' });
  });

  it('AC6: handles a rejection that is not an Error', async () => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- rejecting with a non-Error is exactly what this test covers
    const result = await runProbe(() => Promise.reject('just a string'));

    expect(result).toStrictEqual({ status: 'down', error: 'probe failed' });
  });

  it('AC7: never includes a stack trace in the returned error', async () => {
    const failure = new Error('connect ECONNREFUSED 127.0.0.1:5432');

    const result = await runProbe(() => Promise.reject(failure));

    expect(result.error).toBe('connect ECONNREFUSED 127.0.0.1:5432');
    expect(result.error).not.toContain('at ');
  });

  it('AC8: does not leave a pending timer behind after a fast probe', async () => {
    jest.useFakeTimers();
    try {
      await runProbe(() => Promise.resolve('fast'), 60_000);

      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
