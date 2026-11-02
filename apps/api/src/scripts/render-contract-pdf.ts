import { buildPdf } from '../ingestion/parsers/test-support.js';

/** Lines that fit on a page, at the 18pt leading `buildPdf` draws with. */
const LINES_PER_PAGE = 36;

/** Characters that fit on a line, in 12pt Helvetica inside the margins. */
const LINE_WIDTH = 78;

/**
 * Strips the Markdown that would otherwise be read aloud as punctuation.
 *
 * A PDF has no emphasis to render, so `**90 days**` would reach a citation as
 * four asterisks around the only part of the sentence that matters. The
 * contracts contain no literal asterisk or backtick, so removing them outright
 * is exact rather than a best effort at parsing Markdown.
 *
 * @param line One line of Markdown.
 * @returns The same line as prose.
 */
function asProse(line: string): string {
  return line
    .replace(/^#{1,6}\s*/, '')
    .replace(/[*`]/g, '')
    .trimEnd();
}

/** Breaks a line at spaces so it fits the page width. */
function wrap(line: string): string[] {
  if (line.length <= LINE_WIDTH) {
    return [line];
  }

  const indent = /^\s*(?:- )?/.exec(line)?.[0].length ?? 0;
  const continuation = ' '.repeat(indent);
  const wrapped: string[] = [];
  let current = '';

  for (const word of line.trimStart().split(/\s+/)) {
    const prefix = wrapped.length === 0 ? line.slice(0, indent) : continuation;

    if (current === '') {
      current = prefix + word;
      continue;
    }

    if (current.length + 1 + word.length <= LINE_WIDTH) {
      current += ` ${word}`;
      continue;
    }

    wrapped.push(current);
    current = continuation + word;
  }

  if (current !== '') {
    wrapped.push(current);
  }

  return wrapped;
}

/**
 * Renders a contract's Markdown to a PDF.
 *
 * A new page starts at each `##` heading, so a citation's page number lines up
 * with a clause rather than with wherever the text happened to spill. A page
 * that fills before the next heading is also broken, because `buildPdf` draws
 * from a fixed top and lines past the bottom of the page would be written at a
 * negative coordinate and silently lost - which is the kind of fault that
 * shows up as a retrieval miss and gets blamed on retrieval.
 *
 * @param markdown The contract's source.
 * @returns PDF bytes, ready to upload.
 * @throws If the source holds a character WinAnsiEncoding cannot represent.
 *
 * @example
 * ```ts
 * const bytes = renderContractPdf(await readContract(fixture));
 * ```
 */
export function renderContractPdf(markdown: string): Uint8Array {
  const pages: string[][] = [];
  let current: string[] = [];

  const breakPage = (): void => {
    if (current.length > 0) {
      pages.push(current);
      current = [];
    }
  };

  for (const raw of markdown.split('\n')) {
    if (/^##\s/.test(raw)) {
      breakPage();
    }

    if (raw.trim().length === 0) {
      // A blank line between paragraphs is kept, but never as the first line
      // of a page, where it would read as a missing heading.
      if (current.length > 0) {
        current.push('');
      }

      continue;
    }

    for (const line of wrap(asProse(raw))) {
      if (current.length >= LINES_PER_PAGE) {
        breakPage();
      }

      current.push(line);
    }
  }

  breakPage();

  return buildPdf(pages);
}
