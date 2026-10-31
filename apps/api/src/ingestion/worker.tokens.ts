/**
 * Whether this process should consume the ingestion queue.
 *
 * Supplied by the entrypoint rather than read from the environment inside a
 * module, because `main.ts` and `worker.ts` boot the *same* module tree and
 * must answer this differently: with `WORKER_MODE=separate` the API enqueues
 * and the worker consumes, and no environment variable alone can distinguish
 * the two processes.
 *
 * Provided globally by {@link WorkerModeModule}, which `AppModule.forRoot`
 * installs. There is no default: a module tree without it fails to start,
 * rather than booting a worker that never consumes.
 */
export const RUN_WORKER = Symbol('DOCPILOT_RUN_WORKER');
