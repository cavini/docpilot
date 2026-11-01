import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { chunks } from '../../src/db/schema/index.js';
import { buildHostilePdf } from '../../src/ingestion/parsers/test-support.js';
import { type IngestionJobData } from '../../src/ingestion/ingestion.constants.js';
import { type Job } from 'bullmq';
import { eq } from 'drizzle-orm';

import {
  createIngestionHarness,
  fileFrom,
  type IngestionHarness,
} from '../support/ingestion-harness.js';

/** Global the hostile PDF's payload sets, if anything ever runs it. */
const MARKER = 'DOCPILOT_PDF_JS_EXECUTED';

/** Drives the processor directly, with the job shape BullMQ would hand it. */
function jobFor(documentId: string): Job<IngestionJobData> {
  return {
    data: { documentId },
    attemptsMade: 0,
    opts: { attempts: 3 },
    updateProgress: jest.fn().mockResolvedValue(undefined),
  } as unknown as Job<IngestionJobData>;
}

describe('what an uploaded document can and cannot do', () => {
  let harness: IngestionHarness;

  beforeAll(async () => {
    harness = await createIngestionHarness();
  }, 90_000);

  beforeEach(async () => {
    await harness.reset();
    Reflect.deleteProperty(globalThis, MARKER);
  });

  afterAll(async () => {
    await harness.close();
  });

  describe('a PDF carrying JavaScript', () => {
    it('does not execute it while the text is extracted', async () => {
      // The PDF carries an /OpenAction, a /AA document action and a named
      // /JavaScript entry - the three ways a PDF asks a viewer to run
      // something on open. The payload sets a global.
      const { document } = await harness.documents.upload(
        fileFrom('hostile.pdf', buildHostilePdf(MARKER), 'application/pdf'),
      );

      await harness.processor.process(jobFor(document.id));

      // Asserted on the process rather than read from a library's
      // documentation. If the extractor ever ran it, this would be true.
      expect((globalThis as Record<string, unknown>)[MARKER]).toBeUndefined();
    });

    it('still reads the text, so "nothing ran" is not "nothing was read"', async () => {
      const { document } = await harness.documents.upload(
        fileFrom('hostile.pdf', buildHostilePdf(MARKER), 'application/pdf'),
      );

      await harness.processor.process(jobFor(document.id));

      const stored = await harness.db
        .select()
        .from(chunks)
        .where(eq(chunks.documentId, document.id));

      expect(stored.length).toBeGreaterThan(0);
      expect(stored.map((chunk) => chunk.content).join(' ')).toContain('Lumen billing');
    });

    it('keeps no trace of the script in what was stored', async () => {
      const { document } = await harness.documents.upload(
        fileFrom('hostile.pdf', buildHostilePdf(MARKER), 'application/pdf'),
      );

      await harness.processor.process(jobFor(document.id));

      const stored = await harness.db
        .select()
        .from(chunks)
        .where(eq(chunks.documentId, document.id));
      const text = stored.map((chunk) => chunk.content).join(' ');

      // Only the text layer is extracted; the action dictionaries are not
      // part of it, so the payload never reaches a prompt either.
      expect(text).not.toContain('app.alert');
      expect(text).not.toContain(MARKER);
    });
  });

  describe('a file pretending to be something it is not', () => {
    it('refuses a non-PDF named .pdf', async () => {
      // The extension is a hint; the signature decides. A renamed binary
      // should not reach a PDF engine at all.
      await expect(
        harness.documents.upload(
          fileFrom('payload.pdf', Buffer.from([0x4d, 0x5a, 0x90, 0x00]), 'application/pdf'),
        ),
      ).rejects.toThrow(/named \.pdf but is not a PDF/);
    });

    it('refuses a type the pipeline has no parser for', async () => {
      await expect(
        harness.documents.upload(fileFrom('run.sh', '#!/bin/sh\nrm -rf /\n', 'application/x-sh')),
      ).rejects.toThrow(/Unsupported file type/);
    });

    it('refuses an empty file rather than storing a document that answers nothing', async () => {
      await expect(harness.documents.upload(fileFrom('empty.md', ''))).rejects.toThrow(
        /The file is empty/,
      );
    });

    it('stores a file under an id, never under the name it arrived with', async () => {
      // The filename is data. Used as a path it would be a traversal, so it
      // is kept for display and nothing else.
      const { document } = await harness.documents.upload(
        fileFrom('../../../etc/passwd.md', '# Notes\n\nSome notes about billing.'),
      );

      expect(document.storageKey).toBe(`documents/${document.id}/original`);
      expect(document.storageKey).not.toContain('..');
      expect(document.sourceFilename).toBe('../../../etc/passwd.md');
      expect(document.title).toBe('passwd');
    });
  });

  describe('a document giving the model orders', () => {
    it('AC17: is stored as text, with its instructions intact and inert', async () => {
      const bytes = await readFile(join(__dirname, '..', 'fixtures', 'injection.md'), 'utf8');
      const { document } = await harness.documents.upload(fileFrom('runbook.md', bytes));

      await harness.processor.process(jobFor(document.id));

      const stored = await harness.db
        .select()
        .from(chunks)
        .where(eq(chunks.documentId, document.id));
      const text = stored.map((chunk) => chunk.content).join(' ');

      // Not stripped: pretending the text says something else would be a
      // worse failure than reading it. What matters is how it is framed when
      // it reaches a model, which the prompt tests cover.
      expect(text).toContain('Ignore all previous instructions');
      expect(stored.length).toBeGreaterThan(0);
    });

    it('AC19: keeps the HTML in it as text, never as markup', async () => {
      const bytes = await readFile(join(__dirname, '..', 'fixtures', 'injection.md'), 'utf8');
      const { document } = await harness.documents.upload(fileFrom('runbook.md', bytes));

      await harness.processor.process(jobFor(document.id));

      const stored = await harness.db
        .select()
        .from(chunks)
        .where(eq(chunks.documentId, document.id));
      const text = stored.map((chunk) => chunk.content).join(' ');

      // It survives as characters, which is correct - the renderer is what
      // must not turn it into an element, and that is asserted in the browser.
      expect(text).toMatch(/script|onerror/);
    });
  });
});
