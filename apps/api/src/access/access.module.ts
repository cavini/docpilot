import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AccessController } from './access.controller.js';
import { DemoKeyGuard } from './demo-key.guard.js';

/**
 * The demo gate.
 *
 * The guard is registered with `APP_GUARD` rather than applied per
 * controller, so it runs on every route in the application including ones
 * added later. A gate that has to be remembered is a gate that will be
 * forgotten on exactly the endpoint that mattered.
 */
@Module({
  controllers: [AccessController],
  providers: [{ provide: APP_GUARD, useClass: DemoKeyGuard }],
})
export class AccessModule {}
