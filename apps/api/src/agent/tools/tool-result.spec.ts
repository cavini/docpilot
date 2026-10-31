import { ToolTimeoutError, fail, isFailure, withTimeout } from './tool-result.js';

describe('fail', () => {
  it('builds a failure the model can read', () => {
    expect(fail('not_found', 'no such document')).toEqual({
      ok: false,
      code: 'not_found',
      message: 'no such document',
    });
  });
});

describe('isFailure', () => {
  it('recognises a failure', () => {
    expect(isFailure(fail('invalid_input', 'nope'))).toBe(true);
  });

  it('does not mistake a successful result for one', () => {
    expect(isFailure({ results: [] })).toBe(false);
  });

  it('tolerates null and undefined', () => {
    expect(isFailure(null)).toBe(false);
    expect(isFailure(undefined)).toBe(false);
  });
});

describe('withTimeout', () => {
  it('returns the work when it finishes in time', async () => {
    await expect(withTimeout('t', 1_000, () => Promise.resolve('done'))).resolves.toBe('done');
  });

  it('AC6: returns a structured failure when the budget elapses', async () => {
    // A tool that hangs must not hang the request, and the model should see
    // the same shape it sees for any other failure rather than a second one.
    const result = await withTimeout('summarize_document', 20, async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));

      return 'too late';
    });

    expect(result).toEqual({
      ok: false,
      code: 'timed_out',
      message: expect.stringContaining('summarize_document'),
    });
  });

  it('names the budget in the message, so the model knows what it hit', async () => {
    const result = await withTimeout('t', 15, async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));

      return 'late';
    });

    expect(isFailure(result) && result.message).toContain('15ms');
  });

  it('rethrows an error from the work rather than disguising it as a timeout', async () => {
    // A bug in a tool is not a timeout, and reporting it as one would send
    // the model off retrying something that will never work.
    await expect(
      withTimeout('t', 1_000, () => Promise.reject(new Error('a real bug'))),
    ).rejects.toThrow('a real bug');
  });

  it('clears its timer, so a fast tool does not hold the process open', async () => {
    const before = process.getActiveResourcesInfo().filter((kind) => kind === 'Timeout').length;

    await withTimeout('t', 60_000, () => Promise.resolve('done'));

    expect(process.getActiveResourcesInfo().filter((kind) => kind === 'Timeout')).toHaveLength(
      before,
    );
  });
});

describe('ToolTimeoutError', () => {
  it('carries the tool and the budget, for a log line that says which', () => {
    const error = new ToolTimeoutError('search_docs', 5_000);

    expect(error.toolName).toBe('search_docs');
    expect(error.ms).toBe(5_000);
  });
});
