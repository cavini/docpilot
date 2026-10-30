import { type ParsedDocument, type Segment } from './segment.js';

/**
 * Builds a parsed document from Markdown-ish text, for tests.
 *
 * Deliberately simple: it splits on blank lines, treats a leading `#` as a
 * heading and a fenced block as code. The real Markdown parser is tested
 * separately; this exists so chunker tests can state their input as readable
 * text rather than as a hand-built segment list.
 *
 * @param text Source text. Line endings are normalised, as the parsers do.
 * @returns A parsed document whose offsets index the normalised text.
 */
export function parseForTest(text: string): ParsedDocument {
  const normalised = text.replace(/\r\n/g, '\n');
  const segments: Segment[] = [];

  // Split into blocks on blank lines, but keep fenced blocks whole.
  const lines = normalised.split('\n');
  let cursor = 0;
  let buffer: string[] = [];
  let bufferStart = 0;
  let inFence = false;

  const flush = (): void => {
    if (buffer.length === 0) {
      return;
    }

    const blockText = buffer.join('\n');
    const trimmed = blockText.trim();

    if (trimmed.length > 0) {
      const leading = blockText.length - blockText.trimStart().length;
      const start = bufferStart + leading;
      const headingMatch = /^(#{1,6})\s+/.exec(trimmed);

      segments.push(
        headingMatch
          ? {
              kind: 'heading',
              level: headingMatch[1]?.length ?? 1,
              text: trimmed,
              charStart: start,
              charEnd: start + trimmed.length,
            }
          : {
              kind: trimmed.startsWith('```') ? 'code' : 'paragraph',
              text: trimmed,
              charStart: start,
              charEnd: start + trimmed.length,
            },
      );
    }

    buffer = [];
  };

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      if (inFence) {
        buffer.push(line);
        inFence = false;
        cursor += line.length + 1;
        flush();
        continue;
      }

      flush();
      bufferStart = cursor;
      inFence = true;
      buffer.push(line);
      cursor += line.length + 1;
      continue;
    }

    if (!inFence && line.trim() === '') {
      flush();
      cursor += line.length + 1;
      bufferStart = cursor;
      continue;
    }

    if (buffer.length === 0) {
      bufferStart = cursor;
    }

    buffer.push(line);
    cursor += line.length + 1;
  }

  flush();

  return { text: normalised, segments, pages: [], pageCount: null };
}

/**
 * Counts tokens as roughly four characters each.
 *
 * Chunker tests care about proportions, not about a specific model's
 * vocabulary, and a real tokenizer would make a failing assertion hard to read
 * ("why is this 37 tokens?"). The tokenizer itself is tested where it is used.
 */
export function approximateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
