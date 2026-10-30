import { UnreadableDocumentError } from './parser.js';
import { PdfParser } from './pdf.parser.js';
import { buildPdf } from './test-support.js';

describe('PdfParser', () => {
  const parser = new PdfParser();

  it('AC1: handles PDFs only', () => {
    expect(parser.supports('application/pdf')).toBe(true);
    expect(parser.supports('text/plain')).toBe(false);
  });

  it('AC2: extracts the text of every page', async () => {
    const parsed = await parser.parse(
      buildPdf([['Authentication'], ['Rate limiting'], ['Pagination']]),
    );

    expect(parsed.text).toContain('Authentication');
    expect(parsed.text).toContain('Rate limiting');
    expect(parsed.text).toContain('Pagination');
  });

  it('AC3: reports the page count', async () => {
    const parsed = await parser.parse(buildPdf([['One'], ['Two'], ['Three']]));

    expect(parsed.pageCount).toBe(3);
  });

  it('AC4: records a span for every page', async () => {
    const parsed = await parser.parse(buildPdf([['One'], ['Two']]));

    expect(parsed.pages.map((page) => page.page)).toStrictEqual([1, 2]);
  });

  it('AC5: makes page spans index the document text, so a chunk can name its page', async () => {
    const parsed = await parser.parse(buildPdf([['Authentication'], ['Rate limiting']]));

    const [first, second] = parsed.pages;
    expect(parsed.text.slice(first?.charStart, first?.charEnd)).toContain('Authentication');
    expect(parsed.text.slice(second?.charStart, second?.charEnd)).toContain('Rate limiting');
  });

  it('AC6: gives segments offsets into the whole document, not into their page', async () => {
    const parsed = await parser.parse(
      buildPdf([['Authentication'], ['Rate limiting is enforced per minute.']]),
    );

    for (const segment of parsed.segments) {
      expect(parsed.text.slice(segment.charStart, segment.charEnd)).toBe(segment.text);
    }
  });

  it('AC7: rejects a file that is not a PDF', async () => {
    await expect(parser.parse(new TextEncoder().encode('not a pdf'))).rejects.toThrow(
      UnreadableDocumentError,
    );
  });

  it('AC8: rejects a PDF with no text layer, naming OCR as the reason', async () => {
    // A PDF with pages but nothing drawn on them is what a scan looks like
    // before OCR.
    await expect(parser.parse(buildPdf([[], []]))).rejects.toThrow(/OCR/);
  });
});
