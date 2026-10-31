import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import request from 'supertest';

import { AppModule } from '../../src/app.module.js';
import { type Database } from '../../src/db/database.type.js';
import { DATABASE } from '../../src/db/db.tokens.js';
import { documents } from '../../src/db/schema/index.js';
import { buildPdf } from '../../src/ingestion/parsers/test-support.js';
import { httpServer } from '../support/http.js';

const MARKDOWN = '# Auth\n\nCall POST /auth/token to obtain a bearer token.';

describe('documents (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot({ runWorker: false })],
    }).compile();

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

  /** Posts a file the way a browser would. */
  const upload = (name: string, contents: string | Uint8Array, type = 'text/markdown') =>
    request(httpServer(app))
      .post('/documents')
      .attach('file', Buffer.from(contents as never), { filename: name, contentType: type });

  it('AC1: accepts a Markdown upload and queues it', async () => {
    const { body, status } = await upload('guide.md', MARKDOWN);

    expect(status).toBe(201);
    expect(body).toMatchObject({
      title: 'guide',
      sourceFilename: 'guide.md',
      mimeType: 'text/markdown',
      status: 'queued',
      progress: 0,
      chunkCount: 0,
    });
    expect(body.id).toEqual(expect.any(String));
  });

  it('AC2: accepts a PDF', async () => {
    const { status, body } = await upload(
      'manual.pdf',
      buildPdf([['Authentication']]),
      'application/pdf',
    );

    expect(status).toBe(201);
    expect(body.mimeType).toBe('application/pdf');
  });

  it('AC3: never returns internal columns', async () => {
    const { body } = await upload('guide.md', MARKDOWN);

    expect(body.sha256).toBeUndefined();
    expect(body.storageKey).toBeUndefined();
  });

  it('AC4: answers 200 with the existing document when the same bytes are re-uploaded', async () => {
    const first = await upload('guide.md', MARKDOWN);
    const second = await upload('a-different-name.md', MARKDOWN);

    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
  });

  it('AC5: rejects an unsupported type', async () => {
    const { status, body } = await upload('archive.zip', 'PK', 'application/zip');

    expect(status).toBe(400);
    expect(body.error.code).toBe('invalid_request');
  });

  it('AC6: rejects an empty file', async () => {
    const { status, body } = await upload('empty.md', '');

    expect(status).toBe(400);
    expect(body.error.message).toMatch(/empty|No file/i);
  });

  it('AC7: rejects a request with no file at all', async () => {
    const { status, body } = await request(httpServer(app)).post('/documents');

    expect(status).toBe(400);
    expect(body.error.code).toBe('invalid_request');
  });

  it('AC8: lists documents newest first', async () => {
    await upload('one.md', '# One\n\nFirst document.');
    await upload('two.md', '# Two\n\nSecond document.');

    const { body } = await request(httpServer(app)).get('/documents').expect(200);

    expect(body.items.map((item: { title: string }) => item.title)).toStrictEqual(['two', 'one']);
    expect(body.nextCursor).toBeNull();
  });

  it('AC9: paginates with a cursor rather than an offset', async () => {
    await upload('one.md', '# One\n\nFirst.');
    await upload('two.md', '# Two\n\nSecond.');
    await upload('three.md', '# Three\n\nThird.');

    const first = await request(httpServer(app)).get('/documents?limit=2').expect(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toEqual(expect.any(String));

    const second = await request(httpServer(app))
      .get(`/documents?limit=2&cursor=${encodeURIComponent(String(first.body.nextCursor))}`)
      .expect(200);

    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
  });

  it('AC10: reads one document', async () => {
    const created = await upload('guide.md', MARKDOWN);

    const { body } = await request(httpServer(app))
      .get(`/documents/${String(created.body.id)}`)
      .expect(200);

    expect(body.id).toBe(created.body.id);
  });

  it('AC11: answers 404 for an unknown document', async () => {
    const { body } = await request(httpServer(app))
      .get('/documents/3f1b9c2e-0000-4000-8000-000000000000')
      .expect(404);

    expect(body.error.code).toBe('not_found');
  });

  it('AC12: rejects an id that is not a uuid', async () => {
    await request(httpServer(app)).get('/documents/not-a-uuid').expect(400);
  });

  it('AC13: deletes a document', async () => {
    const created = await upload('guide.md', MARKDOWN);

    await request(httpServer(app))
      .delete(`/documents/${String(created.body.id)}`)
      .expect(204);
    await request(httpServer(app))
      .get(`/documents/${String(created.body.id)}`)
      .expect(404);
  });

  it('AC14: refuses to retry a document that has not failed', async () => {
    const created = await upload('guide.md', MARKDOWN);

    const { body } = await request(httpServer(app))
      .post(`/documents/${String(created.body.id)}/retry`)
      .expect(409);

    expect(body.error.code).toBe('conflict');
  });

  it('AC15: retries a failed document and returns it to queued', async () => {
    const created = await upload('guide.md', MARKDOWN);
    await db.execute(
      sql`update ${documents} set status = 'failed', error = 'boom' where id = ${created.body.id}`,
    );

    const { body } = await request(httpServer(app))
      .post(`/documents/${String(created.body.id)}/retry`)
      .expect(202);

    expect(body.status).toBe('queued');
    expect(body.error).toBeNull();
  });

  it('AC16: carries a request id on every error, so a failure can be traced', async () => {
    const { body } = await request(httpServer(app))
      .get('/documents/3f1b9c2e-0000-4000-8000-000000000000')
      .expect(404);

    expect(body.error.requestId).toEqual(expect.any(String));
  });
});
