/**
 * Splits prose into sentences.
 *
 * Deliberately a regular expression rather than a sentence-boundary library:
 * the result only decides where a chunk may break, so an occasional mistake
 * costs a slightly awkward boundary rather than a wrong answer, and the rule
 * stays something a reader can check at a glance.
 *
 * Breaks after `.`, `!` or `?` followed by whitespace, and keeps the
 * punctuation with the sentence it ends.
 *
 * @param text Prose to split.
 * @returns Sentences, each keeping its trailing whitespace so the pieces
 *   rejoin into the original text exactly.
 */
export function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?]*[.!?]+[\s]*|[^.!?]+$/g);

  return parts?.filter((part) => part.length > 0) ?? (text.length > 0 ? [text] : []);
}

/**
 * Splits text into pieces no larger than `maxTokens`, breaking at whitespace.
 *
 * The last resort, for a single sentence longer than a whole chunk. It still
 * avoids cutting a word in half, because a truncated word is noise in both the
 * embedding and the citation.
 *
 * @param text Text to split.
 * @param maxTokens Ceiling per piece.
 * @param countTokens Token counter.
 * @returns Pieces, in order, none empty.
 */
export function hardSplit(
  text: string,
  maxTokens: number,
  countTokens: (text: string) => number,
): string[] {
  const words = text.split(/(\s+)/).filter((word) => word.length > 0);
  const pieces: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current + word;

    if (current !== '' && countTokens(candidate) > maxTokens) {
      pieces.push(current);
      current = word.trimStart();
      continue;
    }

    current = candidate;
  }

  if (current.trim().length > 0) {
    pieces.push(current);
  }

  return pieces;
}

/**
 * Splits text at line boundaries into pieces no larger than `maxTokens`.
 *
 * Used for a code block too large to keep whole. Breaking mid-line would
 * produce fragments that are neither readable nor runnable, so a single line
 * longer than the ceiling is emitted oversized rather than cut.
 *
 * @param text Code to split.
 * @param maxTokens Ceiling per piece.
 * @param countTokens Token counter.
 * @returns Pieces, each a whole number of lines.
 */
export function splitLines(
  text: string,
  maxTokens: number,
  countTokens: (text: string) => number,
): string[] {
  const lines = text.split('\n');
  const pieces: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const candidate = [...current, line].join('\n');

    if (current.length > 0 && countTokens(candidate) > maxTokens) {
      pieces.push(current.join('\n'));
      current = [line];
      continue;
    }

    current.push(line);
  }

  if (current.length > 0) {
    pieces.push(current.join('\n'));
  }

  return pieces.filter((piece) => piece.trim().length > 0);
}

/** How an overlap may be cut. */
export type OverlapGranularity = 'sentence' | 'line';

/**
 * Takes the trailing text that the next chunk should repeat.
 *
 * Whole units where possible, because an overlap that starts mid-unit reads as
 * a fragment in a citation and embeds poorly. Prose is cut at sentences; code
 * is cut at lines, since half a statement is worse than no overlap at all.
 *
 * The result never exceeds `overlapTokens`. Taking "at least" the budget
 * instead would let one long sentence carry most of the previous chunk into
 * the next one, which inflates every chunk after it.
 *
 * @param text Text of the chunk just emitted.
 * @param overlapTokens Ceiling for the carried text, in tokens.
 * @param countTokens Token counter.
 * @param granularity Cut at sentence or line boundaries.
 * @returns The trailing text, or an empty string when nothing fits.
 */
export function takeOverlap(
  text: string,
  overlapTokens: number,
  countTokens: (text: string) => number,
  granularity: OverlapGranularity = 'sentence',
): string {
  if (overlapTokens <= 0 || text.trim().length === 0) {
    return '';
  }

  const units =
    granularity === 'line'
      ? text.split('\n').map((line, index, all) => (index < all.length - 1 ? `${line}\n` : line))
      : splitSentences(text);

  const carried: string[] = [];

  for (let index = units.length - 1; index >= 0; index -= 1) {
    const candidate = [units[index] ?? '', ...carried].join('');

    if (countTokens(candidate) > overlapTokens) {
      break;
    }

    carried.unshift(units[index] ?? '');
  }

  if (carried.length > 0) {
    return carried.join('');
  }

  // Not even one unit fits. For code that means no overlap: a fragment of a
  // line is not worth carrying. For prose, fall back to whole words.
  if (granularity === 'line') {
    return '';
  }

  const words = text.split(/(\s+)/).filter((word) => word.length > 0);
  const tail: string[] = [];

  for (let index = words.length - 1; index >= 0; index -= 1) {
    const candidate = [words[index] ?? '', ...tail].join('');

    if (tail.length > 0 && countTokens(candidate) > overlapTokens) {
      break;
    }

    tail.unshift(words[index] ?? '');
  }

  return tail.join('').trimStart();
}
