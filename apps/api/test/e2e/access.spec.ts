import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../src/app.module.js';
import { type Env } from '../../src/config/env.schema.js';
import { ENV } from '../../src/config/env.tokens.js';
import { loadEnv } from '../../src/config/load-env.js';
import { httpServer } from '../support/http.js';

const KEY = 'c2f1f0b1e0a94a1d8f3c7b6e5d4a3b2c';

/** Boots the application with the gate configured as given. */
async function appWithKey(demoKey: string): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot({ runWorker: false })],
  })
    .overrideProvider(ENV)
    .useValue({ ...loadEnv(process.env), DEMO_API_KEY: demoKey } satisfies Env)
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  await app.init();

  return app;
}

describe('the demo gate (e2e)', () => {
  describe('when a key is configured', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await appWithKey(KEY);
    }, 60_000);

    afterAll(async () => {
      await app.close();
    });

    it('AC1: refuses a request with no key', async () => {
      const { body } = await request(httpServer(app)).get('/documents').expect(401);

      expect(body).toMatchObject({ error: { code: 'unauthorized' } });
    });

    it('AC1: refuses a request with the wrong key', async () => {
      await request(httpServer(app)).get('/documents').set('x-demo-key', 'not-the-key').expect(401);
    });

    it('AC1: allows a request with the right key', async () => {
      await request(httpServer(app)).get('/documents').set('x-demo-key', KEY).expect(200);
    });

    it('AC1: guards every route, not only the ones somebody remembered', async () => {
      // The guard is global and opt-out. These are different modules; all of
      // them are closed because none of them did anything.
      await request(httpServer(app)).get('/feature-flags').expect(401);
      await request(httpServer(app)).get('/conversations').expect(401);
      await request(httpServer(app)).get('/extract/schemas').expect(401);
      await request(httpServer(app)).post('/search').send({ query: 'anything' }).expect(401);
    });

    it('AC1: refuses before the handler runs, so nothing is spent on a 401', async () => {
      // A 401 from a chat endpoint must cost nothing. If the handler ran
      // first, the key would be protecting the response rather than the
      // balance.
      await request(httpServer(app))
        .post('/chat')
        .send({ question: 'How do I authenticate?' })
        .expect(401);
    });

    it('AC4: lets the health probe through, because the platform has no key', async () => {
      await request(httpServer(app)).get('/health/live').expect(200);
      await request(httpServer(app)).get('/health').expect(200);
    });

    it('names the header, so the next attempt can succeed', async () => {
      const { body } = await request(httpServer(app)).get('/documents').expect(401);

      expect(body.error.message).toContain('x-demo-key');
    });

    it('AC7: says nothing about the key in the response', async () => {
      const { body, headers } = await request(httpServer(app))
        .get('/documents')
        .set('x-demo-key', 'nearly-the-right-key')
        .expect(401);

      const everything = JSON.stringify({ body, headers });

      expect(everything).not.toContain(KEY);
      expect(everything).not.toContain('nearly-the-right-key');
    });

    it('tolerates a key pasted with a trailing newline', async () => {
      await request(httpServer(app)).get('/documents').set('x-demo-key', `${KEY} `).expect(200);
    });

    describe('GET /access', () => {
      it('AC5: confirms a key a client is about to store', async () => {
        const { body } = await request(httpServer(app))
          .get('/access')
          .set('x-demo-key', KEY)
          .expect(200);

        expect(body).toMatchObject({ ok: true, keyRequired: true });
      });

      it('AC6: refuses a key a client should discard', async () => {
        await request(httpServer(app)).get('/access').set('x-demo-key', 'stale').expect(401);
      });

      it('reports the budget, so the interface can say what it will get', async () => {
        const { body } = await request(httpServer(app))
          .get('/access')
          .set('x-demo-key', KEY)
          .expect(200);

        expect(body.budget).toMatchObject({ spent: false, resetsAt: null });
      });
    });
  });

  describe('when no key is configured', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await appWithKey('');
    }, 60_000);

    afterAll(async () => {
      await app.close();
    });

    it('AC3: serves everything, which is the local default', async () => {
      await request(httpServer(app)).get('/documents').expect(200);
      await request(httpServer(app)).get('/feature-flags').expect(200);
    });

    it('AC3: says a key is not required, so a client shows no unlock form', async () => {
      const { body } = await request(httpServer(app)).get('/access').expect(200);

      expect(body).toMatchObject({ ok: true, keyRequired: false });
    });
  });
});
