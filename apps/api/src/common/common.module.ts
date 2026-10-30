import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { AllExceptionsFilter } from './filters/all-exceptions.filter.js';

/**
 * Cross-cutting concerns that apply to every request.
 *
 * The exception filter is registered through `APP_FILTER` rather than through
 * `app.useGlobalFilters()` so that Nest constructs it with dependency
 * injection; the filter needs the logger, and a filter instantiated by hand
 * outside the container cannot be given one.
 */
@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class CommonModule {}
