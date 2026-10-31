/** A run of plain text between citation markers. */
export interface TextSegment {
  kind: 'text';
  text: string;
}

/** A citation marker that resolved to a citation that was actually sent. */
export interface CitationSegment {
  kind: 'citation';
  n: number;
}

/** One piece of an answer: either text, or a marker to render as a chip. */
export type AnswerSegment = TextSegment | CitationSegment;

/** Matches a citation marker such as `[1]` or `[1, 2]`. */
const MARKER = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

/**
 * Splits an answer into text and citation markers.
 *
 * Only markers whose number was actually sent become citations. The server
 * already strips the ones it invented, so an unresolvable marker here means
 * something is wrong rather than something to paper over — it is left as
 * **plain text** so it is visible, not silently removed a second time.
 *
 * Markers inside fenced code blocks are not touched, so an array index in a
 * sample (`items[1]`) stays an array index. This mirrors the server's own
 * masking, and the two have to agree: a chip rendered over something the
 * server never treated as a citation would point at the wrong passage.
 *
 * Operates on one string at a time, so it runs over the text of each
 * markdown node rather than over the whole answer — which is what keeps the
 * markdown structure intact while still replacing markers inside it.
 *
 * @param text A run of answer text, already outside any code block.
 * @param available Citation numbers that were actually sent.
 * @returns The segments to render, in order.
 *
 * @example
 * ```ts
 * splitCitations('Tokens last an hour [1].', new Set([1]));
 * // [{kind:'text', text:'Tokens last an hour '}, {kind:'citation', n:1}, …]
 * ```
 */
export function splitCitations(text: string, available: ReadonlySet<number>): AnswerSegment[] {
  const segments: AnswerSegment[] = [];
  let at = 0;

  for (const match of text.matchAll(MARKER)) {
    const start = match.index;
    const numbers = (match[1] ?? '')
      .split(',')
      .map((part) => Number.parseInt(part.trim(), 10))
      .filter((n) => Number.isFinite(n));

    // A marker is only a citation when every number in it resolves. `[1, 9]`
    // with no ninth passage is not half a citation.
    if (numbers.length === 0 || !numbers.every((n) => available.has(n))) {
      continue;
    }

    if (start > at) {
      segments.push({ kind: 'text', text: text.slice(at, start) });
    }

    for (const n of numbers) {
      segments.push({ kind: 'citation', n });
    }

    at = start + match[0].length;
  }

  if (at < text.length) {
    segments.push({ kind: 'text', text: text.slice(at) });
  }

  return segments;
}
