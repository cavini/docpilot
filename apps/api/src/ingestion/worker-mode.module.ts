import { type DynamicModule, Global, Module } from '@nestjs/common';

import { RUN_WORKER } from './worker.tokens.js';

/**
 * Supplies {@link RUN_WORKER} to the whole application.
 *
 * **Global on purpose, and it has to be.** Nest resolves a provider from the
 * module the *consumer* belongs to, not from whichever module imported it
 * last. `IngestionProcessor` lives in `IngestionModule`, so when that module
 * declared its own `RUN_WORKER` the processor always got that value — and the
 * one `AppModule.forRoot` passed was silently ignored. The queue was never
 * consumed in any process: `WORKER_MODE=inline` left it unread inside the API,
 * and `WORKER_MODE=separate` left it unread in the worker too.
 *
 * Declaring it once, globally, from the entrypoint is what makes a per-process
 * value actually per-process. There is deliberately **no default**: a module
 * tree built without this fails to resolve `RUN_WORKER` and the process dies
 * at startup, which is far better than the alternative it replaces — a worker
 * that boots cleanly, logs nothing, and quietly never picks up a job.
 */
@Global()
@Module({})
export class WorkerModeModule {
  /**
   * @param runWorker Whether this process consumes the ingestion queue.
   * @returns A global module providing {@link RUN_WORKER}.
   *
   * @example
   * ```ts
   * imports: [WorkerModeModule.forRoot(env.WORKER_MODE === 'inline')]
   * ```
   */
  static forRoot(runWorker: boolean): DynamicModule {
    return {
      module: WorkerModeModule,
      providers: [{ provide: RUN_WORKER, useValue: runWorker }],
      exports: [RUN_WORKER],
    };
  }
}
