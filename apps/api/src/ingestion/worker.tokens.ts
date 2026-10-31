/**
 * Whether this process should consume the ingestion queue.
 *
 * Supplied by the entrypoint rather than read from the environment inside a
 * module, because `main.ts` and `worker.ts` boot the *same* module tree and
 * must answer this differently: with `WORKER_MODE=separate` the API enqueues
 * and the worker consumes, and no environment variable alone can distinguish
 * the two processes.
 *
 * Defaults to `false`, so a test that builds the application does not get a
 * background worker racing it for the jobs it is about to process by hand.
 */
export const RUN_WORKER = Symbol('DOCPILOT_RUN_WORKER');
