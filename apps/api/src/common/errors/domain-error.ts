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
