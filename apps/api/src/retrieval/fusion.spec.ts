import { RRF_K, fuse } from './fusion.js';

const chunk = (chunkId: string) => ({ chunkId });

describe('fuse', () => {
  it('AC4: scores each result as the sum of 1/(k + rank) across the lists it appears in', () => {
    const fused = fuse([
      { name: 'vector', results: [chunk('a'), chunk('b')] },
      { name: 'keyword', results: [chunk('b'), chunk('a')] },
    ]);

    const expected = 1 / (RRF_K + 1) + 1 / (RRF_K + 2);
    for (const result of fused) {
      expect(result.score).toBeCloseTo(expected, 10);
    }
  });

  it('AC3: ranks a result found by both methods above one found by only one', () => {
    const fused = fuse([
      // "c" is first by vector but absent from keyword; "a" is second in both.
      { name: 'vector', results: [chunk('c'), chunk('a')] },
      { name: 'keyword', results: [chunk('b'), chunk('a')] },
    ]);

    expect(fused[0]?.item.chunkId).toBe('a');
  });

  it('AC5: keeps a result that only one method found', () => {
    const fused = fuse([
      { name: 'vector', results: [chunk('a')] },
      { name: 'keyword', results: [chunk('b')] },
    ]);

    expect(fused.map((result) => result.item.chunkId).sort()).toStrictEqual(['a', 'b']);
  });

  it('AC6: is deterministic, breaking ties by chunk id', () => {
    const lists = [
      { name: 'vector', results: [chunk('z'), chunk('a')] },
      { name: 'keyword', results: [chunk('a'), chunk('z')] },
    ];

    const first = fuse(lists).map((result) => result.item.chunkId);
    const second = fuse(lists).map((result) => result.item.chunkId);

    // Both score identically; the tie breaks the same way every time.
    expect(first).toStrictEqual(second);
    expect(first).toStrictEqual(['a', 'z']);
  });

  it('AC6b: reports where each method ranked a result, so fusion can be inspected', () => {
    const fused = fuse([
      { name: 'vector', results: [chunk('a'), chunk('b')] },
      { name: 'keyword', results: [chunk('b')] },
    ]);

    const b = fused.find((result) => result.item.chunkId === 'b');
    expect(b?.ranks).toStrictEqual({ vector: 2, keyword: 1 });
  });

  it('AC6c: omits a method from the ranks when it did not find the result', () => {
    const fused = fuse([
      { name: 'vector', results: [chunk('a')] },
      { name: 'keyword', results: [] },
    ]);

    expect(fused[0]?.ranks).toStrictEqual({ vector: 1 });
  });

  it('AC9: returns nothing when every list is empty', () => {
    expect(
      fuse([
        { name: 'vector', results: [] },
        { name: 'keyword', results: [] },
      ]),
    ).toStrictEqual([]);
  });

  it('handles a single list, which is just that list in order', () => {
    const fused = fuse([{ name: 'vector', results: [chunk('a'), chunk('b'), chunk('c')] }]);

    expect(fused.map((result) => result.item.chunkId)).toStrictEqual(['a', 'b', 'c']);
  });

  it('reproduces the worked example from the spec', () => {
    const fused = fuse([
      { name: 'vector', results: [chunk('A'), chunk('C'), chunk('B'), chunk('X'), chunk('E')] },
      { name: 'keyword', results: [chunk('B'), chunk('D'), chunk('A')] },
    ]);

    // A and B appear in both and lead; C and D appear once each; E is last.
    expect(fused.map((result) => result.item.chunkId)).toStrictEqual([
      'A',
      'B',
      'C',
      'D',
      'X',
      'E',
    ]);
  });

  it('lets a top rank in one list beat a poor rank in both', () => {
    // Appearing in both lists is not automatically decisive. "deep" is found
    // by both but ranked 70th in each, scoring 2/130; "solo" is found once at
    // rank 1, scoring 1/61. The damping constant is what decides this, and
    // getting it wrong in either direction is a retrieval-quality bug.
    const filler = (prefix: string) =>
      Array.from({ length: 69 }, (_unused, i) => chunk(`${prefix}${String(i)}`));

    const fused = fuse([
      { name: 'vector', results: [chunk('solo'), ...filler('v'), chunk('deep')] },
      { name: 'keyword', results: [...filler('k'), chunk('deep')] },
    ]);

    const solo = fused.findIndex((result) => result.item.chunkId === 'solo');
    const deep = fused.findIndex((result) => result.item.chunkId === 'deep');

    expect(solo).toBeLessThan(deep);
  });

  it('accepts a different damping constant', () => {
    const fused = fuse([{ name: 'vector', results: [chunk('a')] }], 1);

    expect(fused[0]?.score).toBeCloseTo(0.5, 10);
  });
});
