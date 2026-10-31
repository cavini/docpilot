/**
 * What a tool returns when it cannot do what it was asked.
 *
 * **Returned, not thrown.** A thrown error ends the turn with nothing; a
 * returned one is information the model can act on — retry with different
 * arguments, or tell the reader it could not. The `code` is stable so a
 * prompt can mention it; the `message` is what the model actually reads.
 */
export interface ToolFailure {
  ok: false;
  code: ToolErrorCode;
  message: string;
}

/** Stable identifiers for the ways a tool can fail. */
export type ToolErrorCode =
  'invalid_input' | 'not_found' | 'not_ready' | 'too_large' | 'timed_out' | 'unavailable';

/** Builds a failure a model can read. */
export function fail(code: ToolErrorCode, message: string): ToolFailure {
  return { ok: false, code, message };
}

/**
 * Whether a tool result is a failure.
 *
 * Narrows on the presence of `ok: false`. A successful tool output has no `ok`
 * field at all, which is what makes the discriminant unambiguous without every
 * tool having to wrap its result.
 */
export function isFailure(result: unknown): result is ToolFailure {
  if (typeof result !== 'object' || result === null || !('ok' in result)) {
    return false;
  }

  return result.ok === false;
}

/** Thrown internally when a tool exceeds its budget. */
export class ToolTimeoutError extends Error {
  constructor(
    readonly toolName: string,
    readonly ms: number,
  ) {
    super(`${toolName} did not finish within ${String(ms)}ms.`);
    this.name = 'ToolTimeoutError';
  }
}

/**
 * Runs `work` with a deadline.
 *
 * A tool that hangs must not hang the request: the model is waiting, the
 * reader is waiting, and the provider is still billing for the open turn. The
 * timeout produces the same structured failure as any other error, so the
 * model handles one shape rather than two.
 *
 * The underlying work is **not** cancelled — most of it is a database query or
 * a provider call that will finish and be discarded. What the timeout bounds
 * is how long the loop waits, which is the thing that matters here.
 *
 * @param toolName Named in the failure, so the model knows which tool it was.
 * @param ms Budget in milliseconds.
 * @param work What to run.
 * @returns The work's result, or a `timed_out` failure.
 *
 * @example
 * ```ts
 * return withTimeout('summarize_document', 30_000, () => summarise(id));
 * ```
 */
export async function withTimeout<T>(
  toolName: string,
  ms: number,
  work: () => Promise<T>,
): Promise<T | ToolFailure> {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      work(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new ToolTimeoutError(toolName, ms));
        }, ms);
      }),
    ]);
  } catch (error) {
    if (error instanceof ToolTimeoutError) {
      return fail('timed_out', error.message);
    }

    throw error;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
