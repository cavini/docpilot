/** Extra dictionary entries to splice into the catalog, for hostile fixtures. */
export interface PdfExtras {
  /**
   * Raw dictionary entries added to `/Catalog`.
   *
   * Used to build PDFs that carry the things a reader is right to worry
   * about - embedded JavaScript, an auto-run action, an embedded file - so a
   * test can assert they are inert rather than assume it.
   */
  catalog?: string;
}

/**
 * Characters WinAnsiEncoding places outside Latin-1.
 *
 * Code points 0x80 to 0x9F are control characters in Latin-1 and typographic
 * ones in WinAnsi, which is the whole difference between the two. A contract
 * is written with most of this row - an em dash, curly quotes, an ellipsis -
 * so leaving it out would reject the documents this exists to render.
 */
const WIN_ANSI_SPECIALS: Record<string, number> = {
  '\u20ac': 0x80,
  '\u201a': 0x82,
  '\u0192': 0x83,
  '\u201e': 0x84,
  '\u2026': 0x85,
  '\u2020': 0x86,
  '\u2021': 0x87,
  '\u02c6': 0x88,
  '\u2030': 0x89,
  '\u0160': 0x8a,
  '\u2039': 0x8b,
  '\u0152': 0x8c,
  '\u017d': 0x8e,
  '\u2018': 0x91,
  '\u2019': 0x92,
  '\u201c': 0x93,
  '\u201d': 0x94,
  '\u2022': 0x95,
  '\u2013': 0x96,
  '\u2014': 0x97,
  '\u02dc': 0x98,
  '\u2122': 0x99,
  '\u0161': 0x9a,
  '\u203a': 0x9b,
  '\u0153': 0x9c,
  '\u017e': 0x9e,
  '\u0178': 0x9f,
};

/**
 * Re-encodes text so that one character is one byte, in WinAnsiEncoding.
 *
 * Everything downstream counts bytes using `String.length`: the content
 * stream's `/Length`, and the cross-reference table's offsets into the file.
 * That is only true while every character is one byte, so the conversion
 * happens here rather than at the end, and the rest of the builder keeps
 * working in characters.
 *
 * @param text Source text.
 * @returns The same text, one byte per character.
 * @throws If a character has no WinAnsi position. Substituting `?` would put a
 *   corrupted fixture in front of a reader and tell nobody; a fixture that
 *   fails to build is found by whoever is building it.
 */
function toWinAnsi(text: string): string {
  let encoded = '';

  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    const special = WIN_ANSI_SPECIALS[character];

    if (special !== undefined) {
      encoded += String.fromCharCode(special);
      continue;
    }

    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) {
      encoded += String.fromCharCode(code);
      continue;
    }

    throw new Error(
      `"${character}" (U+${code.toString(16).toUpperCase().padStart(4, '0')}) cannot be written ` +
        'in WinAnsiEncoding, which is all the Helvetica in this PDF can draw.',
    );
  }

  return encoded;
}

/** Escapes the characters that are special inside a PDF string literal. */
function escapePdfText(text: string): string {
  return toWinAnsi(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Builds a minimal, valid PDF containing the given pages of text.
 *
 * Written by hand rather than produced by a rendering library so that PDF
 * fixtures are generated in the test rather than committed as opaque binaries
 * a reviewer cannot read. Each page holds one line per entry, drawn in
 * Helvetica, which is enough to exercise the one thing that matters here: that
 * text comes back attributed to the right page.
 *
 * Text is written in WinAnsiEncoding, so anything Latin-1 can hold survives
 * the round trip. That covers Portuguese, which is the point: an accent that
 * comes back as punctuation is a fixture a reader would blame on retrieval.
 *
 * @param pages One entry per page; each entry is a list of lines.
 * @returns The PDF's bytes.
 *
 * @example
 * ```ts
 * const bytes = buildPdf([['Authentication'], ['Rate limiting']]);
 * ```
 */
export function buildPdf(pages: string[][], extras: PdfExtras = {}): Uint8Array {
  const objects: string[] = [];
  const pageObjectNumbers: number[] = [];

  // 1 catalog, 2 page tree, 3 font, then two objects per page.
  const fontObject = 3;
  let next = 4;

  for (const lines of pages) {
    const contentObject = next + 1;
    pageObjectNumbers.push(next);

    objects[next] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Contents ${String(contentObject)} 0 R ` +
      `/Resources << /Font << /F1 ${String(fontObject)} 0 R >> >> >>`;

    const drawn = lines
      .map(
        (line, index) =>
          `BT /F1 12 Tf 72 ${String(720 - index * 18)} Td (${escapePdfText(line)}) Tj ET`,
      )
      .join('\n');

    objects[contentObject] = `<< /Length ${String(drawn.length)} >>\nstream\n${drawn}\nendstream`;
    next = contentObject + 1;
  }

  objects[1] = `<< /Type /Catalog /Pages 2 0 R${extras.catalog === undefined ? '' : ` ${extras.catalog}`} >>`;
  objects[2] =
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((n) => `${String(n)} 0 R`).join(' ')}] ` +
    `/Count ${String(pages.length)} >>`;
  objects[fontObject] =
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';

  // A PDF's cross-reference table is byte offsets into the file, so the body
  // has to be laid out before the table can be written.
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];

  for (let number = 1; number < next; number += 1) {
    offsets[number] = body.length;
    body += `${String(number)} 0 obj\n${objects[number] ?? '<< >>'}\nendobj\n`;
  }

  const xrefOffset = body.length;
  const size = next;

  let xref = `xref\n0 ${String(size)}\n0000000000 65535 f \n`;

  for (let number = 1; number < size; number += 1) {
    xref += `${String(offsets[number] ?? 0).padStart(10, '0')} 00000 n \n`;
  }

  const trailer =
    `trailer\n<< /Size ${String(size)} /Root 1 0 R >>\n` +
    `startxref\n${String(xrefOffset)}\n%%EOF\n`;

  // Latin-1, not UTF-8: every offset above was measured in characters, and
  // only a one-byte-per-character encoding makes those measurements true.
  return new Uint8Array(Buffer.from(body + xref + trailer, 'latin1'));
}

/**
 * Builds a PDF that carries everything a reader is right to worry about.
 *
 * An `/OpenAction` running JavaScript, a named `/JavaScript` entry, and a
 * document-level action - the three ways a PDF asks a viewer to execute
 * something on open. Plus a line of text, so a test can tell "nothing ran"
 * apart from "nothing was read".
 *
 * The payload writes to a global that the test checks afterwards. If the text
 * extractor ever executed it, the global would be set and the test would
 * fail - which is a far stronger assertion than reading the library's docs.
 *
 * @param marker Name of the global the payload would set if it ran.
 * @returns The PDF's bytes.
 */
export function buildHostilePdf(marker: string): Uint8Array {
  const payload = `app.alert('x'); globalThis['${marker}'] = true;`;
  const action = `<< /Type /Action /S /JavaScript /JS (${escapePdfText(payload)}) >>`;

  return buildPdf([['Lumen billing creates invoices and records payments.']], {
    catalog:
      `/OpenAction ${action} ` +
      `/AA << /WC ${action} >> ` +
      `/Names << /JavaScript << /Names [(evil) ${action}] >> >>`,
  });
}
