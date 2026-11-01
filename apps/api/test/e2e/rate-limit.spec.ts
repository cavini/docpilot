import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type Redis } from 'ioredis';
import request from 'supertest';

import { AppModule } from '../../src/app.module.js';
import { type Env } from '../../src/config/env.schema.js';
import { ENV } from '../../src/config/env.tokens.js';
import { loadEnv } from '../../src/config/load-env.js';
import { RATE_LIMITS } from '../../src/rate-limit/index.js';
import { REDIS } from '../../src/redis/redis.tokens.js';
import { httpServer } from '../support/http.js';

describe('request limits (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot({ runWorker: false })],
    })
      .overrideProvider(ENV)
      .useValue({ ...loadEnv(process.env), RATE_LIMIT_ENABLED: true } satisfies Env)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('AC8: refuses once the window is used up, and says when to retry', async () => {
    const server = httpServer(app);
    const past = RATE_LIMITS.answers.limit + 1;
    let refused: request.Response | undefined;

    for (let attempt = 0; attempt < past; attempt += 1) {
      // `/ask` with an empty corpus never reaches a model, so this exercises
      // the limit without spending anything.
      const response = await request(server).post('/ask').send({ question: 'anything' });

      if (response.status === 429) {
        refused = response;
        break;
      }
    }

    expect(refused).toBeDefined();
    expect(refused?.body).toMatchObject({
      error: { code: 'too_many_requests', message: expect.stringContaining('Try again in') },
    });
  }, 60_000);

  it('AC8: sets Retry-After, so a client that knows nothing about this API backs off', async () => {
    const server = httpServer(app);
    let refused: request.Response | undefined;

    for (let attempt = 0; attempt < RATE_LIMITS.answers.limit + 1; attempt += 1) {
      const response = await request(server).post('/ask').send({ question: 'anything' });

      if (response.status === 429) {
        refused = response;
        break;
      }
    }

    const retryAfter = Number(refused?.headers['retry-after']);

    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(RATE_LIMITS.answers.ttlSeconds);
  }, 60_000);

  it('AC9: limits asking more tightly than reading', () => {
    // Asserted as a property of the configuration rather than by exhausting
    // the read limit, which would take 120 requests to prove something the
    // constants already state. What matters is that the ordering cannot be
    // changed without this failing.
    const perSecond = (group: { limit: number; ttlSeconds: number }): number =>
      group.limit / group.ttlSeconds;

    expect(perSecond(RATE_LIMITS.uploads)).toBeLessThan(perSecond(RATE_LIMITS.answers));
    expect(perSecond(RATE_LIMITS.answers)).toBeLessThan(perSecond(RATE_LIMITS.reads));
  });

  it('AC9: a read is still allowed after asking has been used up', async () => {
    const server = httpServer(app);

    for (let attempt = 0; attempt < RATE_LIMITS.answers.limit + 1; attempt += 1) {
      const response = await request(server).post('/ask').send({ question: 'anything' });

      if (response.status === 429) {
        break;
      }
    }

    // Different budgets, not one shared counter: a reader who asked a lot can
    // still look at their documents.
    await request(server).get('/documents').expect(200);
  }, 60_000);

  it('AC4: never limits the health probe, whatever else is happening', async () => {
    const server = httpServer(app);

    // The platform's probe runs on a schedule and would eventually trip a
    // limit. A demo restarted because it rate-limited its own health check is
    // worse than one that is not limited at all.
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await request(server).get('/health/live').expect(200);
    }
  }, 60_000);

  it('checks the key before counting, so junk traffic writes nothing to Redis', async () => {
    const gated = await Test.createTestingModule({
      imports: [AppModule.forRoot({ runWorker: false })],
    })
      .overrideProvider(ENV)
      .useValue({
        ...loadEnv(process.env),
        RATE_LIMIT_ENABLED: true,
        DEMO_API_KEY: 'a-key-for-this-test',
      } satisfies Env)
      .compile();

    const guarded = gated.createNestApplication();

    await guarded.init();

    const redis = guarded.get<Redis>(REDIS);
    const throttlerKeys = (): Promise<string[]> =>
      redis.keys('*').then((keys) => keys.filter((key) => key.includes('throttl')));

    try {
      for (const key of await throttlerKeys()) {
        await redis.del(key);
      }

      // Asserted on the counter rather than on a later request's status: the
      // tracker is the client address, and every test in this file shares
      // one, so a status check here would be reading someone else's count.
      //
      // The statuses themselves are 401 and then 429 once the guard's own
      // failed-key budget runs out. Either way none of them is counted
      // against the request limiter, which is what this is about.
      for (let attempt = 0; attempt < RATE_LIMITS.answers.limit + 5; attempt += 1) {
        const response = await request(httpServer(guarded)).post('/ask').send({ question: 'x' });

        expect([401, 429]).toContain(response.status);
      }

      expect(await throttlerKeys()).toHaveLength(0);
    } finally {
      await guarded.close();
    }
  }, 90_000);
});
