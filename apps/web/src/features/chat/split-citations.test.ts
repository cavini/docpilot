import { describe, expect, it } from 'vitest';

import { splitCitations } from './split-citations';

const available = new Set([1, 2, 3]);

describe('splitCitations', () => {
  it('AC1: turns a marker into a citation segment', () => {
    expect(splitCitations('Tokens last an hour [1].', available)).toEqual([
      { kind: 'text', text: 'Tokens last an hour ' },
      { kind: 'citation', n: 1 },
      { kind: 'text', text: '.' },
    ]);
  });

  it('returns a single text segment when there are no markers', () => {
    expect(splitCitations('Just prose.', available)).toEqual([
      { kind: 'text', text: 'Just prose.' },
    ]);
  });

  it('returns nothing for empty text', () => {
    expect(splitCitations('', available)).toEqual([]);
  });

  it('AC9: turns the same number cited twice into two chips', () => {
    const segments = splitCitations('First [1]. Also [1].', available);

    expect(segments.filter((segment) => segment.kind === 'citation')).toEqual([
      { kind: 'citation', n: 1 },
      { kind: 'citation', n: 1 },
    ]);
  });

  it('expands a grouped marker into one chip per number', () => {
    const segments = splitCitations('Both agree [1, 2].', available);

    expect(segments.filter((segment) => segment.kind === 'citation')).toEqual([
      { kind: 'citation', n: 1 },
      { kind: 'citation', n: 2 },
    ]);
  });

  it('leaves an unresolvable marker as plain text, rather than hiding it', () => {
    // The server already strips the markers it invented, so one arriving here
    // means something is wrong. Visible beats silently removed twice.
    expect(splitCitations('Claim [9].', available)).toEqual([{ kind: 'text', text: 'Claim [9].' }]);
  });

  it('treats a group with one unresolvable number as not a citation', () => {
    // `[1, 9]` with no ninth passage is not half a citation.
    expect(splitCitations('Claim [1, 9].', available)).toEqual([
      { kind: 'text', text: 'Claim [1, 9].' },
    ]);
  });

  it('leaves bracketed text that is not a number alone', () => {
    expect(splitCitations('See [the docs].', available)).toEqual([
      { kind: 'text', text: 'See [the docs].' },
    ]);
  });

  it('handles a marker at the very start', () => {
    expect(splitCitations('[1] says so.', available)).toEqual([
      { kind: 'citation', n: 1 },
      { kind: 'text', text: ' says so.' },
    ]);
  });

  it('handles a marker at the very end', () => {
    expect(splitCitations('It says so [2]', available)).toEqual([
      { kind: 'text', text: 'It says so ' },
      { kind: 'citation', n: 2 },
    ]);
  });

  it('handles adjacent markers', () => {
    expect(splitCitations('[1][2]', available)).toEqual([
      { kind: 'citation', n: 1 },
      { kind: 'citation', n: 2 },
    ]);
  });

  it('resolves nothing when no citations were sent', () => {
    expect(splitCitations('Claim [1].', new Set())).toEqual([{ kind: 'text', text: 'Claim [1].' }]);
  });

  it('tolerates spaces inside a grouped marker', () => {
    const segments = splitCitations('Both [1 , 2].', available);

    expect(segments.filter((segment) => segment.kind === 'citation')).toHaveLength(2);
  });
});
