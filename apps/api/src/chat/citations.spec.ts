import { type RetrievedChunk } from '../retrieval/index.js';
import { resolveCitations } from './citations.js';

const chunk = (n: number): RetrievedChunk => ({
  chunkId: `chunk-${String(n)}`,
  documentId: `doc-${String(n)}`,
  documentTitle: `document ${String(n)}`,
  content: `Passage number ${String(n)}.`,
  headingPath: `Section ${String(n)}`,
  pageStart: n,
  pageEnd: n,
});

const context = [chunk(1), chunk(2), chunk(3)];

describe('resolveCitations', () => {
  it('AC2: resolves a marker to the chunk that was supplied as that number', () => {
    const { citations } = resolveCitations('Tokens last an hour [2].', context);

    expect(citations).toHaveLength(1);
    expect(citations[0]).toMatchObject({ n: 2, chunkId: 'chunk-2', documentTitle: 'document 2' });
  });

  it('AC3: removes a marker citing a number that was never supplied', () => {
    const { answer, citations } = resolveCitations('Tokens last an hour [7].', context);

    expect(answer).not.toContain('[7]');
    expect(citations).toHaveLength(0);
  });

  it('AC3b: keeps the sentence when it drops an invalid marker', () => {
    const { answer } = resolveCitations('Tokens last an hour [7].', context);

    expect(answer).toContain('Tokens last an hour');
  });

  it('AC3c: keeps valid markers while dropping invalid ones', () => {
    const { answer, citations } = resolveCitations('First [1]. Second [9]. Third [3].', context);

    expect(answer).toContain('[1]');
    expect(answer).toContain('[3]');
    expect(answer).not.toContain('[9]');
    expect(citations.map((c) => c.n)).toStrictEqual([1, 3]);
  });

  it('AC4: returns one citation for a number cited twice', () => {
    const { citations } = resolveCitations('Tokens expire [1] and must be refreshed [1].', context);

    expect(citations).toHaveLength(1);
  });

  it('AC5: orders citations by where their number first appears', () => {
    const { citations } = resolveCitations('Later [3], then earlier [1], then [2].', context);

    expect(citations.map((c) => c.n)).toStrictEqual([3, 1, 2]);
  });

  it('handles a grouped marker such as [1, 2]', () => {
    const { citations } = resolveCitations('Both apply [1, 2].', context);

    expect(citations.map((c) => c.n)).toStrictEqual([1, 2]);
  });

  it('keeps a grouped marker that is partly valid, citing only the valid half', () => {
    const { answer, citations } = resolveCitations('Mixed [2, 8].', context);

    expect(citations.map((c) => c.n)).toStrictEqual([2]);
    expect(answer).toContain('[2, 8]');
  });

  it('ignores a number inside a fenced code block', () => {
    const answer = ['Use the first item [1].', '```ts', 'const first = items[1];', '```'].join(
      '\n',
    );

    const result = resolveCitations(answer, context);

    expect(result.citations.map((c) => c.n)).toStrictEqual([1]);
    expect(result.answer).toContain('const first = items[1];');
  });

  it('does not remove an out-of-range index inside a code block', () => {
    const answer = ['```js', 'const x = arr[42];', '```'].join('\n');

    const result = resolveCitations(answer, context);

    expect(result.answer).toContain('arr[42]');
    expect(result.citations).toHaveLength(0);
  });

  it('AC15: uses the passage text as the snippet, not the heading-prefixed text', () => {
    const { citations } = resolveCitations('Answer [1].', context);

    expect(citations[0]?.snippet).toBe('Passage number 1.');
    expect(citations[0]?.snippet).not.toContain('Section 1');
  });

  it('carries the page range, so a citation can name a page', () => {
    const { citations } = resolveCitations('Answer [3].', context);

    expect(citations[0]).toMatchObject({ pageStart: 3, pageEnd: 3 });
  });

  it('returns no citations for an answer with no markers', () => {
    const { answer, citations } = resolveCitations(
      'I do not know based on the documents.',
      context,
    );

    expect(citations).toStrictEqual([]);
    expect(answer).toBe('I do not know based on the documents.');
  });

  it('returns nothing citable when the context is empty', () => {
    const { answer, citations } = resolveCitations('Something [1].', []);

    expect(citations).toStrictEqual([]);
    expect(answer).not.toContain('[1]');
  });

  it('tidies the spacing left behind by a removed marker', () => {
    const { answer } = resolveCitations('A claim [9] and another.', context);

    expect(answer).not.toMatch(/ {2,}/);
  });

  it('is unaffected by markers appearing in any order or repetition', () => {
    const once = resolveCitations('[1] [2] [1] [2]', context);

    expect(once.citations.map((c) => c.n)).toStrictEqual([1, 2]);
  });
});
