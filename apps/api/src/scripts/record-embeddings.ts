import 'reflect-metadata';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { createOpenAI } from '@ai-sdk/openai';
import { embedMany } from 'ai';

import { loadDotenv } from '../config/load-dotenv.js';
import { loadEnv } from '../config/load-env.js';
import { chunkDocument, embeddingTextFor } from '../ingestion/chunker/index.js';
import { normaliseText, parseBlocks } from '../ingestion/parsers/block-parser.js';
import { TokenizerService } from '../ingestion/tokenizer/tokenizer.service.js';
import {
  EMBEDDING_FIXTURE_PATH,
  RECORDED_QUERIES,
  RECORDED_SOURCES,
} from './recorded.constants.js';

/**
 * Records real embeddings for the retrieval-quality tests.
 *
 * The deterministic mock hashes text, so two paraphrases get unrelated
 * vectors. That is fine for testing batching, storage and caching, and it is
 * useless for testing whether retrieval actually *finds* the right passage —
 * the one thing the product is for.
 *
 * So the fixture corpus is embedded once, for real, and committed. The quality
 * tests then run offline, free and deterministically against vectors that mean
 * something.
 *
 * Run with `pnpm record-embeddings`. It costs a fraction of a cent and needs
 * `OPENAI_API_KEY`; re-run it only when the fixture corpus or the chunker
 * changes, which is why the output is committed rather than regenerated.
 */
async function record(): Promise<void> {
  loadDotenv();
  const env = loadEnv();

  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required to record embeddings.');
  }

  const tokenizer = new TokenizerService();
  const texts = new Set<string>(RECORDED_QUERIES);

  for (const source of RECORDED_SOURCES) {
    const path = resolve(process.cwd(), '..', '..', 'demo-docs', source);
    const text = normaliseText(await readFile(path, 'utf8'));
    const chunks = chunkDocument(
      { text, segments: parseBlocks(text), pages: [], pageCount: null },
      {
        maxTokens: env.CHUNK_SIZE_TOKENS,
        overlapTokens: env.CHUNK_OVERLAP_TOKENS,
        countTokens: tokenizer.counter,
      },
    );

    for (const chunk of chunks) {
      texts.add(embeddingTextFor(chunk));
    }
  }

  const values = [...texts];
  const tokens = values.reduce((sum, value) => sum + tokenizer.count(value), 0);

  console.log(
    `embedding ${String(values.length)} texts, about ${String(tokens)} tokens ` +
      `(~$${(tokens * 0.02e-6).toFixed(5)} at the text-embedding-3-small rate)`,
  );

  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
  const { embeddings } = await embedMany({
    model: openai.embedding(env.EMBEDDING_MODEL),
    values,
  });

  // Rounded to six decimals. Cosine ranking is unaffected at that precision,
  // and the fixture is a third of the size of full float output.
  const recorded: Record<string, number[]> = {};
  for (const [index, value] of values.entries()) {
    recorded[value] = (embeddings[index] ?? []).map((n) => Number(n.toFixed(6)));
  }

  const output = resolve(process.cwd(), EMBEDDING_FIXTURE_PATH);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(
    output,
    `${JSON.stringify({ model: env.EMBEDDING_MODEL, recordedOn: new Date().toISOString().slice(0, 10), vectors: recorded }, null, 0)}\n`,
    'utf8',
  );

  console.log(`wrote ${output}`);
}

void record();
