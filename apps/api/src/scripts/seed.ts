import 'reflect-metadata';

import { readFile, readdir } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';

import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { AppModule } from '../app.module.js';
import { loadDotenv } from '../config/load-dotenv.js';
import { loadEnv } from '../config/load-env.js';
import { DocumentsService } from '../documents/documents.service.js';
import { IngestionProcessor } from '../ingestion/ingestion.processor.js';
import { buildPdf } from '../ingestion/parsers/test-support.js';

/** Where the corpus lives, relative to the app root. */
const CORPUS_DIR = resolve(process.cwd(), '..', '..', 'demo-docs');

/** The Markdown file the PDF is rendered from. */
const PDF_SOURCE = 'lumen-handbook.md';

/** Types the corpus may contain. */
const MIME_TYPES: Record<string, string> = {
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
};

/**
 * Renders Markdown to a PDF, starting a new page at each `##` heading.
 *
 * The corpus needs a PDF so that page-numbered citations are exercised end to
 * end. Generating it here keeps an opaque binary nobody can review out of
 * version control, and makes the fixture reproducible.
 *
 * @param markdown The source text.
 * @returns PDF bytes.
 */
function renderPdf(markdown: string): Uint8Array {
  const pages: string[][] = [];
  let current: string[] = [];

  for (const line of markdown.split('\n')) {
    if (/^##\s/.test(line) && current.length > 0) {
      pages.push(current);
      current = [];
    }

    if (line.trim().length === 0) {
      continue;
    }

    // The PDF writer draws one line per entry, so long lines are wrapped
    // rather than running off the page.
    const text = line.replace(/^#+\s*/, '');
    for (const piece of text.match(/.{1,78}(\s|$)/g) ?? [text]) {
      current.push(piece.trimEnd());
    }
  }

  if (current.length > 0) {
    pages.push(current);
  }

  return buildPdf(pages);
}

/**
 * Ingests the demo corpus.
 *
 * Idempotent, because documents deduplicate on content: running it twice
 * leaves one copy of each. That matters, since it runs on every deploy of the
 * demo.
 *
 * Processing happens inline rather than by waiting on a worker, so the script
 * exits when the work is done rather than when it has merely been queued.
 */
async function seed(): Promise<void> {
  loadDotenv();
  loadEnv();

  const app = await NestFactory.createApplicationContext(AppModule.forRoot({ runWorker: false }), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.flushLogs();

  const logger = app.get(Logger);
  const documents = app.get(DocumentsService);
  const processor = app.get(IngestionProcessor);

  try {
    const entries = (await readdir(CORPUS_DIR)).filter(
      (name) => name !== 'NOTICE.md' && MIME_TYPES[extname(name).toLowerCase()] !== undefined,
    );

    for (const name of entries.sort()) {
      const raw = await readFile(join(CORPUS_DIR, name));
      const isPdfSource = name === PDF_SOURCE;
      const buffer = isPdfSource ? Buffer.from(renderPdf(raw.toString('utf8'))) : raw;
      const filename = isPdfSource ? `${basename(name, '.md')}.pdf` : name;
      const mimetype = isPdfSource
        ? 'application/pdf'
        : (MIME_TYPES[extname(name).toLowerCase()] ?? 'text/plain');

      const { document, deduplicated } = await documents.upload({
        originalname: filename,
        mimetype,
        size: buffer.length,
        buffer,
      });

      if (deduplicated && document.status === 'ready') {
        logger.log(`already ingested: ${filename}`, 'Seed');
        continue;
      }

      await processor.process({
        data: { documentId: document.id },
        attemptsMade: 0,
        opts: { attempts: 1 },
        updateProgress: () => Promise.resolve(),
      } as never);

      const after = await documents.get(document.id);
      logger.log(
        `ingested ${filename}: ${String(after.chunkCount)} chunks, ${after.language ?? 'unknown'}`,
        'Seed',
      );
    }
  } finally {
    await app.close();
  }
}

void seed();
