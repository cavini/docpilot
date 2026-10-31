import { Test, type TestingModule } from '@nestjs/testing';
import { PG_POOL } from '../db/db.tokens.js';
import { REDIS } from '../redis/redis.tokens.js';
import { StorageService } from '../storage/storage.service.js';
import { HealthService } from './health.service.js';

interface Doubles {
  pool: { query: jest.Mock };
  redis: { ping: jest.Mock };
  storage: { probe: jest.Mock };
}

async function createService(): Promise<{ service: HealthService; doubles: Doubles }> {
  const doubles: Doubles = {
    pool: { query: jest.fn().mockResolvedValue({ rows: [] }) },
    redis: { ping: jest.fn().mockResolvedValue('PONG') },
    storage: { probe: jest.fn().mockResolvedValue(undefined) },
  };

  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      HealthService,
      { provide: PG_POOL, useValue: doubles.pool },
      { provide: REDIS, useValue: doubles.redis },
      { provide: StorageService, useValue: doubles.storage },
    ],
  }).compile();

  return { service: moduleRef.get(HealthService), doubles };
}

describe('HealthService', () => {
  it('AC1: reports ok when every dependency answers', async () => {
    const { service } = await createService();

    const result = await service.check();

    expect(result.status).toBe('ok');
    expect(result.dependencies.database.status).toBe('ok');
    expect(result.dependencies.redis.status).toBe('ok');
    expect(result.dependencies.storage.status).toBe('ok');
  });

  it('AC2: probes all three dependencies', async () => {
    const { service, doubles } = await createService();

    await service.check();

    expect(doubles.pool.query).toHaveBeenCalledWith('select 1');
    expect(doubles.redis.ping).toHaveBeenCalledTimes(1);
    expect(doubles.storage.probe).toHaveBeenCalledTimes(1);
  });

  it('AC3: reports down overall when the database is unreachable', async () => {
    const { service, doubles } = await createService();
    doubles.pool.query.mockRejectedValue(new Error('connection refused'));

    const result = await service.check();

    expect(result.status).toBe('down');
    expect(result.dependencies.database).toStrictEqual({
      status: 'down',
      error: 'connection refused',
    });
  });

  it('AC4: still reports the healthy dependencies when one is down', async () => {
    const { service, doubles } = await createService();
    doubles.redis.ping.mockRejectedValue(new Error('redis is gone'));

    const result = await service.check();

    expect(result.dependencies.redis.status).toBe('down');
    expect(result.dependencies.database.status).toBe('ok');
    expect(result.dependencies.storage.status).toBe('ok');
  });

  it('AC5: reports down when storage is unreachable', async () => {
    const { service, doubles } = await createService();
    doubles.storage.probe.mockRejectedValue(new Error('NoSuchBucket'));

    const result = await service.check();

    expect(result.status).toBe('down');
    expect(result.dependencies.storage.error).toBe('NoSuchBucket');
  });

  it('AC6: never throws, even when every dependency fails', async () => {
    const { service, doubles } = await createService();
    doubles.pool.query.mockRejectedValue(new Error('a'));
    doubles.redis.ping.mockRejectedValue(new Error('b'));
    doubles.storage.probe.mockRejectedValue(new Error('c'));

    await expect(service.check()).resolves.toMatchObject({ status: 'down' });
  });

  it('AC7: probes concurrently rather than one after another', async () => {
    const { service, doubles } = await createService();
    const started: string[] = [];
    const block =
      <T>(name: string, value: T) =>
      () => {
        started.push(name);
        return new Promise<T>((resolve) => {
          setTimeout(() => {
            resolve(value);
          }, 20);
        });
      };

    doubles.pool.query.mockImplementation(block('database', { rows: [] }));
    doubles.redis.ping.mockImplementation(block('redis', 'PONG'));
    doubles.storage.probe.mockImplementation(block('storage', undefined));

    const elapsedStart = Date.now();
    await service.check();
    const elapsed = Date.now() - elapsedStart;

    // All three start before any finishes, so the total is near one probe's
    // duration rather than the sum of the three.
    expect(started).toStrictEqual(['database', 'redis', 'storage']);
    expect(elapsed).toBeLessThan(55);
  });

  it('AC8: reports an ISO 8601 timestamp and a non negative uptime', async () => {
    const { service } = await createService();

    const result = await service.check();

    expect(result.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});
