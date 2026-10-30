import { type HealthResponse } from '@docpilot/shared';
import { type Response } from 'express';

import { HealthController } from './health.controller.js';
import { type HealthService } from './health.service.js';

const healthy: HealthResponse = {
  status: 'ok',
  version: '0.0.0',
  uptimeSeconds: 10,
  checkedAt: '2026-10-30T12:00:00.000Z',
  dependencies: {
    database: { status: 'ok', latencyMs: 1 },
    redis: { status: 'ok', latencyMs: 1 },
    storage: { status: 'ok', latencyMs: 1 },
  },
};

function createController(result: HealthResponse) {
  const service = { check: jest.fn().mockResolvedValue(result) } as unknown as HealthService;
  const response = { status: jest.fn() } as unknown as Response;

  return { controller: new HealthController(service), response, service };
}

describe('HealthController', () => {
  it('AC1: answers 200 when every dependency is usable', async () => {
    const { controller, response } = createController(healthy);

    await controller.check(response);

    expect(response.status).toHaveBeenCalledWith(200);
  });

  it('AC2: answers 503 when a dependency is down', async () => {
    const { controller, response } = createController({ ...healthy, status: 'down' });

    await controller.check(response);

    expect(response.status).toHaveBeenCalledWith(503);
  });

  it('AC3: answers 200 when degraded, because the API can still serve', async () => {
    const { controller, response } = createController({ ...healthy, status: 'degraded' });

    await controller.check(response);

    expect(response.status).toHaveBeenCalledWith(200);
  });

  it('AC4: returns the full body whatever the status, so the caller can diagnose', async () => {
    const down = { ...healthy, status: 'down' as const };
    const { controller, response } = createController(down);

    await expect(controller.check(response)).resolves.toStrictEqual(down);
  });

  it('AC5: liveness probes nothing and always reports the process is up', () => {
    const { controller, service } = createController(healthy);

    expect(controller.live()).toStrictEqual({ status: 'ok' });
    expect(service.check).not.toHaveBeenCalled();
  });
});
