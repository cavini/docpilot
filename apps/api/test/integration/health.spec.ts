import { Test, type TestingModule } from '@nestjs/testing';
import { type Pool } from 'pg';

import { AppModule } from '../../src/app.module.js';
import { PG_POOL } from '../../src/db/db.tokens.js';
import { HealthService } from '../../src/health/health.service.js';

describe('health against real infrastructure', () => {
  let moduleRef: TestingModule;
  let health: HealthService;
  let pool: Pool;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot({ runWorker: false })],
    }).compile();
    await moduleRef.init();

    health = moduleRef.get(HealthService);
    pool = moduleRef.get(PG_POOL);
  }, 60_000);

  afterAll(async () => {
    await moduleRef.close();
  });

  it('AC1: reports every dependency healthy against real containers', async () => {
    const result = await health.check();

    // Asserted as one object so a failure names the dependency and its reason.
    expect(result).toMatchObject({
      status: 'ok',
      dependencies: {
        database: { status: 'ok' },
        redis: { status: 'ok' },
        storage: { status: 'ok' },
      },
    });
  });

  it('AC2: measures a real latency for each probe', async () => {
    const result = await health.check();

    for (const dependency of Object.values(result.dependencies)) {
      expect(dependency.latencyMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('AC3: connects to a Postgres that can create a vector column', async () => {
    // Proves the pgvector extension is installed and usable, which is the one
    // thing a fake Postgres would get wrong.
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    await pool.query('CREATE TEMP TABLE probe (id int, embedding vector(3))');
    await pool.query("INSERT INTO probe VALUES (1, '[1,2,3]')");

    const { rows } = await pool.query<{ distance: number }>(
      "SELECT embedding <=> '[1,2,3]' AS distance FROM probe",
    );

    expect(Number(rows[0]?.distance)).toBeCloseTo(0, 6);
  });

  it('AC4: can create the HNSW index that similarity search depends on', async () => {
    // Only a real pgvector build can answer this. Retrieval is planned around
    // an HNSW index with cosine distance, so a Postgres that cannot create one
    // would pass every mocked test and fail the moment search is wired up.
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    await pool.query('CREATE TABLE IF NOT EXISTS index_probe (id serial, embedding vector(3))');
    await pool.query(
      'CREATE INDEX IF NOT EXISTS index_probe_hnsw ON index_probe USING hnsw (embedding vector_cosine_ops)',
    );

    const { rows } = await pool.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE indexname = 'index_probe_hnsw'",
    );

    expect(rows[0]?.indexdef).toContain('hnsw');
    expect(rows[0]?.indexdef).toContain('vector_cosine_ops');

    await pool.query('DROP TABLE index_probe');
  });

  it('AC5: full text search is available with the configurations the corpus needs', async () => {
    const { rows } = await pool.query<{ cfgname: string }>(
      "SELECT cfgname FROM pg_ts_config WHERE cfgname IN ('english', 'portuguese') ORDER BY cfgname",
    );

    // The demo corpus is in both languages, and each needs its own stemmer.
    expect(rows.map((row) => row.cfgname)).toStrictEqual(['english', 'portuguese']);
  });
});
