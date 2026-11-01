/**
 * Base class for errors that describe a problem with the request or with a
 * dependency, rather than a bug.
 *
 * Every domain error carries a stable machine-readable `code` and the HTTP
 * status it maps to, so the global exception filter can translate it without
 * knowing about individual error types. Clients branch on `code`; the
 * `message` is for humans and may change.
 */
export abstract class DomainError extends Error {
  /** Stable identifier clients may branch on. Never changes once shipped. */
  abstract readonly code: string;

  /** HTTP status this error maps to. */
  abstract readonly httpStatus: number;

  /**
   * Extra context safe to return to the client. Never put credentials, whole
   * documents or whole prompts here.
   */
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = new.target.name;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

/** A resource the request named does not exist. */
export class NotFoundError extends DomainError {
  override readonly code = 'not_found';
  override readonly httpStatus = 404;

  /**
   * @param resource Kind of thing that was not found, such as `document`.
   * @param id Identifier that was looked up.
   */
  constructor(resource: string, id: string) {
    super(`${resource} ${id} was not found`, { resource, id });
  }
}

/** The request was understood but is not acceptable. */
export class InvalidRequestError extends DomainError {
  override readonly code = 'invalid_request';
  override readonly httpStatus = 400;
}

/**
 * The request body is larger than the configured limit.
 *
 * Separate from {@link InvalidRequestError} because 413 tells a client
 * something actionable that 400 does not: the request was understood and is
 * simply too big, so retrying it unchanged will not help.
 */
export class PayloadTooLargeError extends DomainError {
  override readonly code = 'payload_too_large';
  override readonly httpStatus = 413;
}

/** The request conflicts with the current state, such as a duplicate upload. */
export class ConflictError extends DomainError {
  override readonly code = 'conflict';
  override readonly httpStatus = 409;
}

/**
 * The caller has made too many requests in the window.
 *
 * Carries `retryAfterSeconds` so a client is told when to come back rather
 * than left to guess, which is the difference between a limit and a wall.
 */
export class TooManyRequestsError extends DomainError {
  override readonly code = 'too_many_requests';
  override readonly httpStatus = 429;

  /**
   * @param retryAfterSeconds How long until the window reopens.
   */
  constructor(readonly retryAfterSeconds: number) {
    super(
      'Too many requests. This is a small demo paid for out of pocket, so the ' +
        `limits are low. Try again in ${humanDuration(retryAfterSeconds)}.`,
      { retryAfterSeconds },
    );
  }
}

/**
 * Renders a wait as something a person reads rather than counts.
 *
 * A daily limit expires in tens of thousands of seconds, and "try again in
 * 71,384 seconds" is a number a reader has to do arithmetic on to act on.
 *
 * @param seconds How long to wait.
 * @returns A phrase such as "about 2 hours".
 */
function humanDuration(seconds: number): string {
  if (seconds < 60) {
    return `${String(Math.max(1, Math.round(seconds)))} seconds`;
  }

  if (seconds < 3_600) {
    const minutes = Math.round(seconds / 60);

    return minutes === 1 ? 'a minute' : `about ${String(minutes)} minutes`;
  }

  const hours = Math.round(seconds / 3_600);

  return hours === 1 ? 'about an hour' : `about ${String(hours)} hours`;
}

/**
 * The caller did not present the demo key.
 *
 * Carries no detail about what was supplied - not its value, not its length,
 * not whether it was close. A message that says "wrong key" and one that says
 * "key too short" are different amounts of help to someone guessing.
 */
export class UnauthorizedError extends DomainError {
  override readonly code = 'unauthorized';
  override readonly httpStatus = 401;
}

/**
 * The corpus already holds as many documents as it is allowed to.
 *
 * 409 rather than 413: the request is not too large, it conflicts with the
 * current state, and the client can act on it by deleting something.
 */
export class CorpusFullError extends DomainError {
  override readonly code = 'corpus_full';
  override readonly httpStatus = 409;

  /**
   * @param limit The configured ceiling, named so the message is actionable.
   */
  constructor(limit: number) {
    super(
      `The corpus already holds its limit of ${String(limit)} documents. ` +
        'Delete one before uploading another.',
      { limit },
    );
  }
}

/**
 * The day's spend ceiling has been reached and this call would cost money.
 *
 * Only ingestion raises this. Answering degrades to the mock instead, because
 * a canned answer is disposable - whereas a document embedded by the mock
 * would sit in the corpus returning confident nonsense for every future
 * search, with nothing in the interface ever saying so.
 *
 * 503 rather than 402: nothing is for sale, and the condition clears on its
 * own at midnight, which is what `Retry-After` is for.
 */
export class BudgetExhaustedError extends DomainError {
  override readonly code = 'budget_exhausted';
  override readonly httpStatus = 503;

  /**
   * @param resetsAt When the ceiling lifts, if it is known.
   */
  constructor(resetsAt: Date | null) {
    super(
      "The demo's budget for today is spent, so nothing new can be " + 'processed until it resets.',
      resetsAt === null ? {} : { resetsAt: resetsAt.toISOString() },
    );
  }
}

/**
 * A system the API depends on is unreachable or failing.
 *
 * Mapped to 503 rather than 500 because the request may well succeed on a
 * retry, and because it points at infrastructure rather than at code.
 */
export class DependencyUnavailableError extends DomainError {
  override readonly code = 'dependency_unavailable';
  override readonly httpStatus = 503;

  /**
   * @param dependency Name of the failing system, such as `database`.
   * @param cause Underlying error, kept for the logs and not returned.
   */
  constructor(
    readonly dependency: string,
    override readonly cause?: unknown,
  ) {
    super(`${dependency} is unavailable`, { dependency });
  }
}
