import { type RetrievedChunk } from '../retrieval/index.js';

/** A citation resolved back to the passage it refers to. */
export interface Citation {
  /** The number as it appears in the answer. */
  n: number;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  headingPath: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  /** The passage's own text, for display beside the answer. */
  snippet: string;
}

/** An answer with its invalid markers removed and its citations resolved. */
export interface CitedAnswer {
  answer: string;
  citations: Citation[];
}

/** Matches a fenced code block, so markers inside one can be left alone. */
const FENCED_BLOCK = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;

/** Matches a citation marker such as `[1]` or `[1, 2]`. */
const MARKER = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

/** Replaces fenced blocks with equal-length padding, preserving offsets. */
function maskCode(text: string): string {
  return text.replace(FENCED_BLOCK, (block) => ' '.repeat(block.length));
}

/**
 * Resolves the citation markers in an answer.
 *
 * A model will occasionally cite a number that was never supplied — `[7]` when
 * three passages were given. Such a marker is **removed from the answer text**
 * rather than left in place, because a reader who clicks a citation that goes
 * nowhere trusts the next one less. Dropping it is the honest repair: the
 * sentence stays, the false attribution does not.
 *
 * Markers inside fenced code blocks are ignored, so an array index in a sample
 * (`items[1]`) is not mistaken for a citation.
 *
 * Citations are returned in the order their numbers first appear, and a number
 * cited twice yields one citation.
 *
 * @param answer The model's answer.
 * @param context The passages that were supplied, in the order they were
 *   numbered — `context[0]` is `[1]`.
 * @returns The answer with invalid markers removed, and the resolved
 *   citations.
 *
 * @example
 * ```ts
 * resolveCitations('Tokens last an hour [1]. [9] is invalid.', [chunk]);
 * // answer: 'Tokens last an hour [1]. is invalid.'
 * ```
 */
export function resolveCitations(answer: string, context: RetrievedChunk[]): CitedAnswer {
  const masked = maskCode(answer);
  const used: number[] = [];

  // Walk the masked copy to find markers, so offsets line up with the real
  // text and code blocks are skipped.
  const invalidRanges: { start: number; end: number }[] = [];

  for (const match of masked.matchAll(MARKER)) {
    const numbers = (match[1] ?? '').split(',').map((part) => Number.parseInt(part.trim(), 10));
    const valid = numbers.filter((n) => n >= 1 && n <= context.length);

    if (valid.length === 0) {
      invalidRanges.push({ start: match.index, end: match.index + match[0].length });
      continue;
    }

    for (const n of valid) {
      if (!used.includes(n)) {
        used.push(n);
      }
    }
  }

  // Remove invalid markers from the end backwards, so earlier offsets stay
  // correct as the string shrinks.
  let cleaned = answer;
  for (const range of [...invalidRanges].reverse()) {
    cleaned = cleaned.slice(0, range.start) + cleaned.slice(range.end);
  }

  return {
    answer: cleaned.replace(/[ \t]{2,}/g, ' ').trim(),
    citations: used.map((n) => toCitation(n, context[n - 1])),
  };
}

/** Builds a citation from the chunk a number refers to. */
function toCitation(n: number, chunk: RetrievedChunk | undefined): Citation {
  if (!chunk) {
    throw new Error(`Citation ${String(n)} has no context chunk, which should be impossible.`);
  }

  return {
    n,
    chunkId: chunk.chunkId,
    documentId: chunk.documentId,
    documentTitle: chunk.documentTitle,
    headingPath: chunk.headingPath,
    pageStart: chunk.pageStart,
    pageEnd: chunk.pageEnd,
    // The chunk's own text, not the heading-prefixed text used for embedding:
    // the heading is already in the citation's own metadata.
    snippet: chunk.content,
  };
}
