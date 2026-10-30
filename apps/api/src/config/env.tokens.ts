/**
 * Injection token for the validated environment.
 *
 * Injecting the parsed object rather than Nest's `ConfigService` means a
 * provider that needs configuration declares `Env` as its dependency and gets
 * a fully typed value, so a typo in a variable name is a compile error instead
 * of an `undefined` at runtime.
 *
 * @example
 * ```ts
 * constructor(@Inject(ENV) private readonly env: Env) {}
 * ```
 */
export const ENV = Symbol('DOCPILOT_ENV');
