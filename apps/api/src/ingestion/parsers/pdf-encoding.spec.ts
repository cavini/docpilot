import { PdfParser } from './pdf.parser.js';
import { buildPdf } from './test-support.js';

/**
 * What `buildPdf` has to get right for a non-English fixture.
 *
 * Separate from `pdf.parser.spec.ts`, whose AC numbers belong to the ingestion
 * pipeline spec. These belong to `docs/specs/demo-contracts.md`, and two
 * different `AC6`s in one file would break the one thing the numbering is for.
 */
describe('building a PDF from text that is not ASCII', () => {
  const parser = new PdfParser();

  it('AC6: returns Portuguese text exactly as it went in', async () => {
    const line = 'A manutenção será remunerada após a aceitação, três vezes ao mês.';

    const parsed = await parser.parse(buildPdf([[line]]));

    expect(parsed.text.trim()).toBe(line);
  });

  it('AC6: covers the accented characters Portuguese actually uses', async () => {
    const line = 'àáâãçéêíóôõúü ÀÁÂÃÇÉÊÍÓÔÕÚÜ';

    const parsed = await parser.parse(buildPdf([[line]]));

    expect(parsed.text.trim()).toBe(line);
  });

  it('AC6: maps the typographic characters a contract is written with', async () => {
    const line = 'The fee — see Schedule “A” — is the Customer’s to pay…';

    const parsed = await parser.parse(buildPdf([[line]]));

    expect(parsed.text.trim()).toBe(line);
  });

  it('AC7: writes cross-reference offsets that point at the objects they claim', () => {
    // Asserted against the bytes rather than by reading a parser's warnings:
    // pdf.js rebuilds a broken table and carries on, so a reader that works is
    // no evidence the file is well formed.
    const bytes = buildPdf([['Cláusula 1 — Objeto'], ['Cláusula 2 — Preço']]);
    const file = Buffer.from(bytes).toString('latin1');

    const startxref = /startxref\s+(\d+)/.exec(file);
    expect(startxref).not.toBeNull();

    const table = file.slice(Number(startxref?.[1]));
    const header = /^xref\s+0\s+(\d+)\s/.exec(table);
    expect(header).not.toBeNull();

    const size = Number(header?.[1]);
    const entries = [...table.matchAll(/(\d{10}) (\d{5}) ([nf])/g)];
    expect(entries).toHaveLength(size);

    entries.forEach((entry, object) => {
      if (entry[3] === 'f') {
        return;
      }

      expect(file.slice(Number(entry[1]))).toMatch(new RegExp(`^${String(object)} 0 obj`));
    });
  });

  it('AC8: refuses a character it cannot represent, naming it', () => {
    expect(() => buildPdf([['A clause about ☃ snowmen']])).toThrow(/☃/);
  });

  it('AC8: refuses it rather than writing a substitute', () => {
    // The failure that matters is the quiet one: a fixture shipped with `?`
    // where a character should be, found by a reader and not by a test.
    expect(() => buildPdf([['日本語']])).toThrow(/cannot be written/i);
  });
});
