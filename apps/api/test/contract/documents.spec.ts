import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';

import { AppModule } from '../../src/app.module.js';
import { type Database } from '../../src/db/database.type.js';
import { DATABASE } from '../../src/db/db.tokens.js';
import { documents } from '../../src/db/schema/index.js';
import { httpServer } from '../support/http.js';
import { describeErrors, responseValidator } from './openapi-validator.js';

const MARKDOWN = '# Auth\n\nCall POST /auth/token to obtain a bearer token.';

describe('document responses match the published contract', () => {
  let app: INestApplication;
  let db: Database;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    db = app.get<Database>(DATABASE);
  }, 90_000);

  beforeEach(async () => {
    await db.execute(sql`truncate table ${documents} cascade`);
  });

  afterAll(async () => {
    await app.close();
  });

  const upload = () =>
    request(httpServer(app)).post('/documents').attach('file', Buffer.from(MARKDOWN), {
      filename: 'guide.md',
      contentType: 'text/markdown',
    });

  it('a created document matches its documented 201 response', async () => {
    const validate = responseValidator('/documents', 'post', '201');
    const { body } = await upload().expect(201);

    expect(validate(body) || describeErrors(validate)).toBe(true);
  });

  it('a deduplicated upload matches its documented 200 response', async () => {
    await upload().expect(201);
    const validate = responseValidator('/documents', 'post', '200');
    const { body } = await upload().expect(200);

    expect(validate(body) || describeErrors(validate)).toBe(true);
  });

  it('the document list matches its documented response', async () => {
    await upload().expect(201);
    const validate = responseValidator('/documents', 'get', '200');
    const { body } = await request(httpServer(app)).get('/documents').expect(200);

    expect(validate(body) || describeErrors(validate)).toBe(true);
  });

  it('reading one document matches its documented response', async () => {
    const created = await upload().expect(201);
    const validate = responseValidator('/documents/{id}', 'get', '200');
    const { body } = await request(httpServer(app))
      .get(`/documents/${String(created.body.id)}`)
      .expect(200);

    expect(validate(body) || describeErrors(validate)).toBe(true);
  });

  it('rejects a document missing a required field', () => {
    // Guards the guard: a schema that accepted anything would make the tests
    // above pass while testing nothing.
    const validate = responseValidator('/documents/{id}', 'get', '200');

    expect(validate({ id: '3f1b9c2e-0000-4000-8000-000000000000' })).toBe(false);
  });

  it('rejects an unknown status value', () => {
    const validate = responseValidator('/documents/{id}', 'get', '200');

    expect(
      validate({
        id: '3f1b9c2e-0000-4000-8000-000000000000',
        title: 'guide',
        sourceFilename: 'guide.md',
        mimeType: 'text/markdown',
        sizeBytes: 10,
        status: 'levitating',
        progress: 0,
        language: null,
        error: null,
        pageCount: null,
        chunkCount: 0,
        createdAt: '2026-10-30T12:00:00.000Z',
        updatedAt: '2026-10-30T12:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('a 404 matches its documented error shape', async () => {
    const validate = responseValidator('/documents/{id}', 'get', '404');
    const { body } = await request(httpServer(app))
      .get('/documents/3f1b9c2e-0000-4000-8000-000000000000')
      .expect(404);

    expect(validate(body) || describeErrors(validate)).toBe(true);
  });

  it('a rejected upload matches its documented error shape', async () => {
    const validate = responseValidator('/documents', 'post', '400');
    const { body } = await request(httpServer(app)).post('/documents').expect(400);

    expect(validate(body) || describeErrors(validate)).toBe(true);
  });
});
