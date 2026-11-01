import { SCHEMA_NAMES } from '@docpilot/shared';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type Job } from 'bullmq';
import { sql } from 'drizzle-orm';
import request from 'supertest';

import { AppModule } from '../../src/app.module.js';
import { type Database } from '../../src/db/database.type.js';
import { DATABASE } from '../../src/db/db.tokens.js';
import { documents } from '../../src/db/schema/index.js';
import { DocumentsService } from '../../src/documents/documents.service.js';
import { type IngestionJobData } from '../../src/ingestion/ingestion.constants.js';
import { IngestionProcessor } from '../../src/ingestion/ingestion.processor.js';
import { httpServer } from '../support/http.js';
import { describeErrors, openApiDocument, responseValidator } from './openapi-validator.js';

const CORPUS = '# Lumen\n\n## Authentication\n\nCall POST /auth/token for a bearer token.';

describe('extraction matches the published contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot({ runWorker: false })],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    const db = app.get<Database>(DATABASE);
    await db.execute(sql`truncate table ${documents} cascade`);

    const { document } = await app.get(DocumentsService).upload({
      originalname: 'lumen.md',
      mimetype: 'text/markdown',
      size: Buffer.byteLength(CORPUS),
      buffer: Buffer.from(CORPUS),
    });

    await app.get(IngestionProcessor).process({
      data: { documentId: document.id },
      attemptsMade: 0,
      opts: { attempts: 1 },
      updateProgress: () => Promise.resolve(),
    } as unknown as Job<IngestionJobData>);
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  it('the schema list matches its documented response', async () => {
    const validate = responseValidator('/extract/schemas', 'get', '200');
    const { body } = await request(httpServer(app)).get('/extract/schemas').expect(200);

    expect(validate(body) || describeErrors(validate)).toBe(true);
  });

  it.each(SCHEMA_NAMES)(
    'an extraction of %s matches its documented response',
    async (schema) => {
      const validate = responseValidator('/extract', 'post', '200');
      const { body } = await request(httpServer(app)).post('/extract').send({ schema }).expect(200);

      expect(validate(body) || describeErrors(validate)).toBe(true);
    },
    60_000,
  );

  it('rejects a result missing its usage', () => {
    // Guards the guard: a schema accepting anything would make the tests
    // above pass while asserting nothing.
    const validate = responseValidator('/extract', 'post', '200');

    expect(
      validate({ schema: 'api_endpoints', items: [], citations: [], dropped: 0, repaired: false }),
    ).toBe(false);
  });

  it('rejects a schema summary missing its fields', () => {
    const validate = responseValidator('/extract/schemas', 'get', '200');

    expect(validate({ schemas: [{ name: 'api_endpoints', title: 'x', description: 'y' }] })).toBe(
      false,
    );
  });

  it('a rejected extraction matches the documented error shape', async () => {
    const validate = responseValidator('/extract', 'post', '400');
    const { body } = await request(httpServer(app))
      .post('/extract')
      .send({ schema: 'nope' })
      .expect(400);

    expect(validate(body) || describeErrors(validate)).toBe(true);
  });

  it('documents the streaming endpoint as an event stream, not as JSON', () => {
    // A client generated from a spec claiming JSON here would try to parse
    // the whole response as one object and hang.
    const content =
      openApiDocument.paths['/extract/stream']?.post?.responses?.['200']?.content ?? {};

    expect(Object.keys(content)).toContain('text/event-stream');
    expect(Object.keys(content)).not.toContain('application/json');
  });

  it('publishes every registered schema name in the request enum', () => {
    // A schema the server knows but the spec does not is one a generated
    // client cannot ask for.
    const body = openApiDocument.paths['/extract']?.post?.requestBody as
      { content?: Record<string, { schema?: { $ref?: string } }> } | undefined;
    const ref = body?.content?.['application/json']?.schema?.$ref ?? '';
    const name = ref.split('/').pop() ?? '';
    const dto = (openApiDocument.components?.schemas?.[name] ?? {}) as {
      properties?: { schema?: { enum?: string[] } };
    };

    expect(dto.properties?.schema?.enum).toEqual([...SCHEMA_NAMES]);
  });
});
