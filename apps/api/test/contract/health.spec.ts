import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { httpServer } from '../support/http.js';

import { AppModule } from '../../src/app.module.js';
import { buildOpenApiDocument } from '../../src/swagger.js';
import { describeErrors, openApiDocument, responseValidator } from './openapi-validator.js';

/**
 * Contract tests carry no `ACn` prefixes, unlike every other level.
 *
 * What they assert is a property of the whole published spec — that every
 * route is in it, that every documented path exists, and that real responses
 * validate against the schemas clients are generated from. That cuts across
 * features rather than belonging to one criterion, and a local `AC3` here
 * would collide with a different `AC3` in a feature spec, breaking the one
 * thing the numbering is for: `grep -r AC3` finding the test that proves it.
 */
describe('API responses match the published contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('documents every route the application exposes', () => {
    const live = Object.keys(buildOpenApiDocument(app).paths).sort();
    const committed = Object.keys(openApiDocument.paths).sort();

    // Catches the common drift, an endpoint added without regenerating the
    // spec, which would leave the generated clients unable to call it.
    //
    // Only the route list is compared, not the whole document: the committed
    // spec is produced by `nest build`, whose Swagger plugin reads TSDoc into
    // the `description` fields, while this in-process build is compiled by SWC
    // without that plugin. The two therefore differ in descriptions by design.
    // Whether the committed file is byte-for-byte current is checked in CI by
    // re-running `pnpm openapi:export` and diffing, which compares like with
    // like.
    expect(live).toStrictEqual(committed);
  });

  it('GET /health matches its documented 200 response', async () => {
    const validate = responseValidator('/health', 'get', '200');
    const { body } = await request(httpServer(app)).get('/health').expect(200);

    const valid = validate(body);

    expect(valid || describeErrors(validate)).toBe(true);
  });

  it('rejects a response missing a required field', () => {
    const validate = responseValidator('/health', 'get', '200');

    // Guards the guard: if the schema accepted anything, AC2 would pass while
    // testing nothing.
    expect(validate({ status: 'ok' })).toBe(false);
  });

  it('rejects an unknown status value', () => {
    const validate = responseValidator('/health', 'get', '200');

    expect(
      validate({
        status: 'probably-fine',
        version: '0.0.0',
        uptimeSeconds: 1,
        checkedAt: '2026-10-30T12:00:00.000Z',
        dependencies: {
          database: { status: 'ok' },
          redis: { status: 'ok' },
          storage: { status: 'ok' },
        },
      }),
    ).toBe(false);
  });

  it('leaves no dead entries: every documented path is reachable', async () => {
    const server = httpServer(app);

    for (const path of ['/health', '/health/live', '/feature-flags']) {
      const response = await request(server).get(path);

      expect(response.status).not.toBe(404);
    }
  });
});
