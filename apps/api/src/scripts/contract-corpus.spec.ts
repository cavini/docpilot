import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { validateUpload } from '../documents/upload-validation.js';
import { chunkDocument } from '../ingestion/chunker/index.js';
import { detectLanguage } from '../ingestion/parsers/index.js';
import { PdfParser } from '../ingestion/parsers/pdf.parser.js';
import { TextParser } from '../ingestion/parsers/text.parser.js';
import { TokenizerService } from '../ingestion/tokenizer/tokenizer.service.js';
import {
  CONTRACTS_PDF_DIR,
  CONTRACT_FIXTURES,
  contractFixture,
  readContract,
} from './contract-corpus.js';
import { type ContractFixture } from './contract-corpus.js';
import { renderContractPdf } from './render-contract-pdf.js';

/**
 * Proves the shipped fixtures are uploadable, rather than that the pipeline
 * could read some hypothetical contract.
 *
 * The corpus is the first thing a reader interacts with and the part nothing
 * else tests. A Portuguese file edited until it reads as English, a PDF whose
 * accents come back as punctuation, or an amendment that stops contradicting
 * the agreement it amends, all break the demo while every other suite stays
 * green.
 */
describe('the contract corpus', () => {
  const pdfParser = new PdfParser();
  const textParser = new TextParser();
  const countTokens = new TokenizerService().counter;

  /** The bytes and name a reader would actually drag into the uploader. */
  const uploadableBytes = async (
    fixture: ContractFixture,
  ): Promise<{ name: string; bytes: Uint8Array }> => {
    if (fixture.format !== 'pdf') {
      return {
        name: fixture.file,
        bytes: new TextEncoder().encode(await readContract(fixture)),
      };
    }

    // Read from `pdf/` when it has been rendered, so the test covers the file
    // on disk; fall back to rendering, so a clean checkout still runs.
    const name = `${fixture.file.replace(/\.md$/, '')}.pdf`;

    try {
      return { name, bytes: new Uint8Array(await readFile(join(CONTRACTS_PDF_DIR, name))) };
    } catch {
      return { name, bytes: renderContractPdf(await readContract(fixture)) };
    }
  };

  /** Parses a fixture the way an upload of it would be parsed. */
  const parseAsUploaded = async (fixture: ContractFixture) => {
    const source = await readContract(fixture);

    return fixture.format === 'pdf'
      ? pdfParser.parse(renderContractPdf(source))
      : textParser.parse(new TextEncoder().encode(source));
  };

  it('holds a document of every role in both languages', () => {
    for (const role of ['agreement', 'nda', 'amendment'] as const) {
      expect(contractFixture(role, 'english')).toBeDefined();
      expect(contractFixture(role, 'portuguese')).toBeDefined();
    }
  });

  describe.each(CONTRACT_FIXTURES)('$file', (fixture) => {
    it('AC1: parses to non-empty text', async () => {
      const parsed = await parseAsUploaded(fixture);

      expect(parsed.text.trim().length).toBeGreaterThan(0);
    });

    it(`AC2: is detected as ${fixture.language}`, async () => {
      const parsed = await parseAsUploaded(fixture);

      expect(detectLanguage(parsed.text)).toBe(fixture.language);
    });

    it('AC1: passes upload validation as a browser would send it', async () => {
      // The MIME type a browser attaches is a claim, and for Markdown it is
      // usually `application/octet-stream`. A fixture the pipeline can parse
      // but the upload endpoint rejects is still a fixture nobody can use.
      const { name, bytes } = await uploadableBytes(fixture);
      // Typed as an open record, not a literal, so a missing extension is
      // `undefined` rather than a type error waiting behind a cast.
      const declared: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.txt': 'text/plain',
      };
      const extension = name.slice(name.lastIndexOf('.'));

      const validated = validateUpload(
        {
          originalname: name,
          mimetype: declared[extension] ?? 'application/octet-stream',
          size: bytes.length,
          buffer: Buffer.from(bytes),
        },
        20,
      );

      expect(validated.sizeBytes).toBe(bytes.length);
      expect(validated.sha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('AC3: chunks into as many passages as its length implies', async () => {
      const parsed = await parseAsUploaded(fixture);
      const chunks = chunkDocument(parsed, { maxTokens: 500, overlapTokens: 75, countTokens });

      // An amendment is two pages and is meant to be retrieved whole; the
      // long-form documents have to split, or every question in the demo
      // retrieves the same passage.
      expect(chunks.length).toBeGreaterThanOrEqual(fixture.role === 'amendment' ? 1 : 4);
    });
  });

  describe.each(CONTRACT_FIXTURES.filter((fixture) => fixture.format === 'pdf'))(
    '$file rendered to PDF',
    (fixture) => {
      it('AC9: keeps the last clause, rather than dropping what ran off a page', async () => {
        const source = await readContract(fixture);
        const parsed = await pdfParser.parse(renderContractPdf(source));

        // The final heading in the source, and the last words under it. A page
        // that overflows loses its tail silently, and nothing downstream would
        // ever say so.
        const headings = [...source.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1] ?? '');
        const lastHeading = headings.at(-1) ?? '';
        const lastSentence = source.trimEnd().split('\n').at(-1) ?? '';

        expect(lastHeading).not.toBe('');
        expect(parsed.text).toContain(lastHeading);
        expect(parsed.text.replace(/\s+/g, ' ')).toContain(lastSentence.replace(/\s+/g, ' '));
      });
    },
  );

  describe('the two services agreements', () => {
    it('AC4: commit to different uptime, so a cross-document question has two answers', async () => {
      const english = await readContract(contractFixture('agreement', 'english'));
      const portuguese = await readContract(contractFixture('agreement', 'portuguese'));

      // Written with the decimal separator each language uses, so the pattern
      // accepts both and the comparison is between the figures.
      const uptimeOf = (text: string): string => /\*\*(\d\d[.,]\d+)%\*\*/.exec(text)?.[1] ?? '';

      expect(uptimeOf(english)).not.toBe('');
      expect(uptimeOf(portuguese)).not.toBe('');
      expect(uptimeOf(english)).not.toBe(uptimeOf(portuguese));
    });

    it('AC4: give different notice periods for termination', async () => {
      const english = await readContract(contractFixture('agreement', 'english'));
      const portuguese = await readContract(contractFixture('agreement', 'portuguese'));

      expect(english).toMatch(/\*\*90 days\*\*/);
      expect(portuguese).toMatch(/\*\*60 \(sessenta\) dias\*\*/);
    });

    it('AC4: cap liability over different periods', async () => {
      const english = await readContract(contractFixture('agreement', 'english'));
      const portuguese = await readContract(contractFixture('agreement', 'portuguese'));

      // Normalised, because the sources are hard-wrapped and a phrase that
      // happens to straddle a line break is still the phrase.
      const prose = (text: string): string => text.replace(/\s+/g, ' ');

      expect(prose(english)).toContain('12 months before the event');
      expect(prose(portuguese)).toContain('6 meses anteriores');
    });
  });

  describe('the amendments', () => {
    it('AC5: the English amendment names the clause it replaces and contradicts it', async () => {
      const agreement = await readContract(contractFixture('agreement', 'english'));
      const amendment = await readContract(contractFixture('amendment', 'english'));

      expect(amendment).toMatch(/Clause 6\.1/);
      expect(agreement).toContain('99.9%');
      expect(amendment).toContain('99.95%');
      expect(agreement).not.toContain('99.95%');
    });

    it('AC5: the Portuguese amendment names the clause it replaces and contradicts it', async () => {
      const acordo = await readContract(contractFixture('agreement', 'portuguese'));
      const aditivo = await readContract(contractFixture('amendment', 'portuguese'));

      expect(aditivo).toMatch(/Cláusula 6\.1/);
      expect(acordo).toContain('99,5%');
      expect(aditivo).toContain('99,8%');
      expect(acordo).not.toContain('99,8%');
    });

    it('AC5: each amendment is dated after the agreement it amends', async () => {
      const amendment = await readContract(contractFixture('amendment', 'english'));
      const aditivo = await readContract(contractFixture('amendment', 'portuguese'));

      // A question about a superseded figure is only answerable if the reader
      // can tell which document is later, so each amendment states both dates.
      expect(amendment).toContain('12 September 2026');
      expect(amendment).toContain('dated 1 March 2026');
      expect(aditivo).toContain('20 de outubro de 2026');
      expect(aditivo).toContain('1º de abril de 2026');
    });
  });
});
