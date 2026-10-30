import { type Segment } from '../chunker/index.js';

/** Matches an ATX heading: one to six hashes, a space, then the title. */
const ATX_HEADING = /^(#{1,6})\s+(.*)$/;

/** Matches a Setext underline: a run of `=` (level 1) or `-` (level 2). */
const SETEXT_UNDERLINE = /^(=+|-{2,})\s*$/;

/** Matches the opening or closing line of a fenced code block. */
const FENCE = /^\s*(```|~~~)/;

/**
 * Splits text into the structural segments the chunker consumes.
 *
 * Handles the three things chunking actually needs: heading levels, fenced
 * code boundaries, and blank-line separated blocks. Lists, tables and
 * blockquotes come through as paragraph-like blocks, which is the right
 * treatment for chunking — they are prose to retrieve, not structure to
 * navigate.
 *
 * Written rather than taken from a Markdown library because a full parser
 * produces an abstract syntax tree with no reliable character offsets back
 * into the source, and those offsets are what let a citation highlight the
 * exact passage. The cost is that exotic Markdown degrades to paragraphs,
 * which is acceptable; the benefit is that every segment knows where it came
 * from.
 *
 * @param text Normalised text, with line endings already converted.
 * @param offset Character offset of `text` within the whole document, so a
 *   per-page call can report document-wide offsets.
 * @returns Segments in document order.
 */
export function parseBlocks(text: string, offset = 0): Segment[] {
  const segments: Segment[] = [];
  const lines = text.split('\n');

  let cursor = offset;
  let buffer: string[] = [];
  let bufferStart = offset;
  let fence: string | null = null;

  const push = (kind: Segment['kind'], body: string, start: number, level?: number): void => {
    const trimmed = body.trim();

    if (trimmed.length === 0) {
      return;
    }

    // Offsets point at the trimmed text, so slicing the source returns exactly
    // what the segment holds.
    const lead = body.length - body.trimStart().length;

    segments.push({
      kind,
      ...(level === undefined ? {} : { level }),
      text: trimmed,
      charStart: start + lead,
      charEnd: start + lead + trimmed.length,
    });
  };

  const flushParagraph = (): void => {
    if (buffer.length > 0) {
      push('paragraph', buffer.join('\n'), bufferStart);
      buffer = [];
    }
  };

  for (const line of lines) {
    const lineLength = line.length + 1;

    if (fence !== null) {
      buffer.push(line);

      if (line.trimStart().startsWith(fence)) {
        push('code', buffer.join('\n'), bufferStart);
        buffer = [];
        fence = null;
      }

      cursor += lineLength;
      continue;
    }

    const fenceMatch = FENCE.exec(line);

    if (fenceMatch) {
      flushParagraph();
      fence = fenceMatch[1] ?? '```';
      bufferStart = cursor;
      buffer.push(line);
      cursor += lineLength;
      continue;
    }

    const atx = ATX_HEADING.exec(line);

    if (atx) {
      flushParagraph();
      push('heading', line, cursor, atx[1]?.length ?? 1);
      cursor += lineLength;
      bufferStart = cursor;
      continue;
    }

    // A Setext heading is an underline beneath a single line of text, so it is
    // only recognisable once the next line is read.
    const underline = SETEXT_UNDERLINE.exec(line);

    if (underline && buffer.length === 1 && (buffer[0] ?? '').trim().length > 0) {
      push('heading', buffer[0] ?? '', bufferStart, underline[1]?.startsWith('=') === true ? 1 : 2);
      buffer = [];
      cursor += lineLength;
      bufferStart = cursor;
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      cursor += lineLength;
      bufferStart = cursor;
      continue;
    }

    if (buffer.length === 0) {
      bufferStart = cursor;
    }

    buffer.push(line);
    cursor += lineLength;
  }

  // An unterminated fence is treated as code to the end of the document,
  // rather than discarded.
  if (fence !== null) {
    push('code', buffer.join('\n'), bufferStart);
  } else {
    flushParagraph();
  }

  return segments;
}

/**
 * Converts line endings to `\n`.
 *
 * Every offset recorded downstream indexes the normalised text, so this has to
 * happen before anything is measured. Doing it later would shift every offset
 * by the number of carriage returns removed before it.
 *
 * @param text Raw text.
 * @returns Text with `\r\n` and bare `\r` converted to `\n`.
 */
export function normaliseText(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}
