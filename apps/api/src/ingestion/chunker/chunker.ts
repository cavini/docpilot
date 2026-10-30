import { type Chunk, type ChunkOptions } from './chunk.js';
import { type ParsedDocument, type Segment } from './segment.js';
import {
  hardSplit,
  type OverlapGranularity,
  splitLines,
  splitSentences,
  takeOverlap,
} from './split-text.js';

/** A piece of text small enough to go into a chunk, with where it came from. */
interface Piece {
  text: string;
  charStart: number;
  charEnd: number;
}

/** Work in progress: the pieces accumulated so far for the current chunk. */
interface Accumulator {
  pieces: Piece[];
  headingPath: string | null;
  /** Text carried over from the previous chunk, which has no own offsets. */
  overlap: string;
  /** How the next overlap should be cut, decided by what this chunk holds. */
  granularity: OverlapGranularity;
}

/** Joins the heading stack into the path stored on a chunk. */
function pathOf(stack: { level: number; title: string }[]): string | null {
  return stack.length > 0 ? stack.map((entry) => entry.title).join(' > ') : null;
}

/** Strips the leading `#` markers from a heading's text. */
function headingTitle(segment: Segment): string {
  return segment.text.replace(/^#{1,6}\s+/, '').trim();
}

/** Finds the pages a character range touches. */
function pagesFor(
  document: ParsedDocument,
  charStart: number,
  charEnd: number,
): { pageStart: number | null; pageEnd: number | null } {
  if (document.pages.length === 0) {
    return { pageStart: null, pageEnd: null };
  }

  const touched = document.pages.filter(
    (page) => page.charStart < charEnd && page.charEnd > charStart,
  );

  if (touched.length === 0) {
    return { pageStart: null, pageEnd: null };
  }

  return {
    pageStart: touched[0]?.page ?? null,
    pageEnd: touched.at(-1)?.page ?? null,
  };
}

/**
 * Breaks a segment into pieces that each fit within the ceiling.
 *
 * The fallback ladder from the spec: a code block splits at line boundaries, a
 * paragraph at sentence boundaries, and a single oversized sentence is hard
 * split at whitespace.
 */
function piecesFor(segment: Segment, options: ChunkOptions): Piece[] {
  const { maxTokens, countTokens } = options;

  if (countTokens(segment.text) <= maxTokens) {
    return [{ text: segment.text, charStart: segment.charStart, charEnd: segment.charEnd }];
  }

  const parts =
    segment.kind === 'code'
      ? splitLines(segment.text, maxTokens, countTokens)
      : splitSentences(segment.text).flatMap((sentence) =>
          countTokens(sentence) <= maxTokens
            ? [sentence]
            : hardSplit(sentence, maxTokens, countTokens),
        );

  // Walk the original text so each piece keeps real offsets rather than
  // offsets reconstructed from its own length.
  const pieces: Piece[] = [];
  let cursor = segment.charStart;

  for (const part of parts) {
    if (part.trim().length === 0) {
      cursor += part.length;
      continue;
    }

    const found = segment.text.indexOf(part.trim(), cursor - segment.charStart);
    const start = found >= 0 ? segment.charStart + found : cursor;

    pieces.push({ text: part.trim(), charStart: start, charEnd: start + part.trim().length });
    cursor = start + part.trim().length;
  }

  return pieces;
}

/**
 * Splits a parsed document into passages for embedding.
 *
 * Text is split along the strongest structural boundary available: a heading
 * starts a new chunk, paragraphs accumulate until the ceiling, and only a
 * piece that is still too large falls through to sentences and then to a hard
 * split. Consecutive chunks repeat roughly `overlapTokens` of text, so a
 * sentence that answers a question is not lost to a boundary.
 *
 * See `docs/specs/chunking.md` for the behaviour and `docs/rag-pipeline.md`
 * for why it is shaped this way.
 *
 * @param document The parsed document, with offsets into its normalised text.
 * @param options Size, overlap, and how to count tokens.
 * @returns Chunks in document order, numbered from 0.
 * @throws If `overlapTokens` is not smaller than `maxTokens`, which would make
 *   each chunk repeat the whole of the one before it and never advance.
 *
 * @example
 * ```ts
 * chunkDocument(parsed, { maxTokens: 500, overlapTokens: 75, countTokens });
 * ```
 */
export function chunkDocument(document: ParsedDocument, options: ChunkOptions): Chunk[] {
  const { maxTokens, overlapTokens, countTokens } = options;

  if (overlapTokens >= maxTokens) {
    throw new Error(
      `chunk overlap (${String(overlapTokens)}) must be smaller than the chunk size (${String(maxTokens)})`,
    );
  }

  const chunks: Chunk[] = [];
  const headingStack: { level: number; title: string }[] = [];
  let current: Accumulator = {
    pieces: [],
    headingPath: null,
    overlap: '',
    granularity: 'sentence',
  };

  const textOf = (accumulator: Accumulator): string =>
    [accumulator.overlap, ...accumulator.pieces.map((piece) => piece.text)]
      .filter((part) => part.trim().length > 0)
      .join('\n\n');

  const emit = (): void => {
    if (current.pieces.length === 0) {
      return;
    }

    const content = textOf(current);
    const charStart = current.pieces[0]?.charStart ?? 0;
    const charEnd = current.pieces.at(-1)?.charEnd ?? charStart;

    chunks.push({
      ordinal: chunks.length,
      content,
      tokenCount: countTokens(content),
      headingPath: current.headingPath,
      ...pagesFor(document, charStart, charEnd),
      charStart,
      charEnd,
    });

    current = {
      pieces: [],
      headingPath: current.headingPath,
      overlap: takeOverlap(content, overlapTokens, countTokens, current.granularity),
      granularity: 'sentence',
    };
  };

  for (const segment of document.segments) {
    if (segment.kind === 'heading') {
      // A heading starts a new section, and a section boundary is a chunk
      // boundary: a chunk spanning two sections retrieves for both and answers
      // well for neither.
      emit();

      const level = segment.level ?? 1;
      while (headingStack.length > 0 && (headingStack.at(-1)?.level ?? 0) >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, title: headingTitle(segment) });

      current = {
        pieces: [],
        headingPath: pathOf(headingStack),
        overlap: '',
        granularity: 'sentence',
      };
      continue;
    }

    for (const piece of piecesFor(segment, options)) {
      const candidate: Accumulator = { ...current, pieces: [...current.pieces, piece] };

      if (current.pieces.length > 0 && countTokens(textOf(candidate)) > maxTokens) {
        emit();
      }

      // A piece sized to the ceiling plus a carried overlap would overflow it.
      // The piece is the content; the overlap is a convenience, so the overlap
      // gives way.
      if (
        current.pieces.length === 0 &&
        current.overlap !== '' &&
        countTokens(`${current.overlap}\n\n${piece.text}`) > maxTokens
      ) {
        current.overlap = '';
      }

      if (segment.kind === 'code') {
        current.granularity = 'line';
      }

      current.pieces.push(piece);
    }
  }

  emit();

  return chunks;
}
