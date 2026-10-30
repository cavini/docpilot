import { type ChunkOptions } from './chunk.js';
import { chunkDocument } from './chunker.js';
import { type ParsedDocument } from './segment.js';
import { approximateTokens, parseForTest } from './test-support.js';

const options = (overrides: Partial<ChunkOptions> = {}): ChunkOptions => ({
  maxTokens: 100,
  overlapTokens: 20,
  countTokens: approximateTokens,
  ...overrides,
});

/** Builds a paragraph of roughly `tokens` tokens. */
const paragraph = (tokens: number, word = 'alpha'): string =>
  Array.from({ length: Math.ceil((tokens * 4) / (word.length + 1)) }, () => word).join(' ');

/** Overlap between two chunks, measured in shared trailing/leading text. */
function sharedTokens(previous: string, next: string, count: (t: string) => number): number {
  for (let length = Math.min(previous.length, next.length); length > 0; length -= 1) {
    if (previous.endsWith(next.slice(0, length))) {
      return count(next.slice(0, length));
    }
  }

  return 0;
}

describe('chunkDocument', () => {
  it('AC1: produces one chunk for text that fits', () => {
    const chunks = chunkDocument(parseForTest('A short paragraph that fits easily.'), options());

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toContain('A short paragraph that fits easily.');
  });

  it('AC2: never exceeds the token ceiling for ordinary prose', () => {
    const text = [paragraph(80), paragraph(80), paragraph(80)].join('\n\n');

    const chunks = chunkDocument(parseForTest(text), options());

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(100);
    }
  });

  it('AC3: overlaps consecutive chunks by roughly the configured amount', () => {
    const text = Array.from({ length: 6 }, () => paragraph(40)).join('\n\n');

    const chunks = chunkDocument(parseForTest(text), options({ overlapTokens: 20 }));

    expect(chunks.length).toBeGreaterThan(2);
    for (let i = 1; i < chunks.length; i += 1) {
      const shared = sharedTokens(
        chunks[i - 1]?.content ?? '',
        chunks[i]?.content ?? '',
        approximateTokens,
      );
      expect(shared).toBeGreaterThanOrEqual(10);
      expect(shared).toBeLessThanOrEqual(40);
    }
  });

  it('AC4: records the chain of headings above each chunk', () => {
    const text = [
      '# Auth',
      '',
      '## Tokens',
      '',
      '### Refresh',
      '',
      'Refresh tokens last 30 days.',
    ].join('\n');

    const chunks = chunkDocument(parseForTest(text), options());

    expect(chunks.at(-1)?.headingPath).toBe('Auth > Tokens > Refresh');
  });

  it('AC5: makes a section boundary a chunk boundary', () => {
    const text = [
      '# Alpha',
      '',
      'Content about alpha.',
      '',
      '# Beta',
      '',
      'Content about beta.',
    ].join('\n');

    const chunks = chunkDocument(parseForTest(text), options());

    for (const chunk of chunks) {
      const mentionsBoth =
        chunk.content.includes('about alpha') && chunk.content.includes('about beta');
      expect(mentionsBoth).toBe(false);
    }
  });

  it('AC6: keeps a code block whole when it fits', () => {
    const code = ['```ts', 'const token = await auth();', 'console.log(token);', '```'].join('\n');
    const text = ['# Example', '', 'Use it like this:', '', code].join('\n');

    const chunks = chunkDocument(parseForTest(text), options());

    const holder = chunks.find((chunk) => chunk.content.includes('const token'));
    expect(holder?.content).toContain('```ts');
    expect(holder?.content).toContain('```');
    expect(holder?.content).toContain('console.log(token);');
  });

  it('AC7: splits an oversized code block at line boundaries, never mid-line', () => {
    const lines = Array.from(
      { length: 120 },
      (_unused, i) => `const value${String(i)} = compute(${String(i)});`,
    );
    const text = ['```ts', ...lines, '```'].join('\n');

    const chunks = chunkDocument(parseForTest(text), options({ maxTokens: 60 }));

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      for (const line of chunk.content.split('\n')) {
        const isWhole =
          line === '```ts' ||
          line === '```' ||
          line === '' ||
          /^const value\d+ = compute\(\d+\);$/.test(line);
        expect(isWhole).toBe(true);
      }
    }
  });

  it('AC8: splits an oversized paragraph at sentence boundaries', () => {
    const sentence = 'This sentence carries a reasonable amount of text about authentication. ';
    const text = sentence.repeat(20).trim();

    const chunks = chunkDocument(parseForTest(text), options({ maxTokens: 60 }));

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.trim()).toMatch(/\.$/);
    }
  });

  it('AC9: hard splits a single sentence longer than the ceiling, with no empty chunk', () => {
    const text = `${'word '.repeat(400).trim()}.`;

    const chunks = chunkDocument(parseForTest(text), options({ maxTokens: 50 }));

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.trim().length).toBeGreaterThan(0);
      expect(chunk.tokenCount).toBeLessThanOrEqual(50);
    }
  });

  it('AC10: produces nothing for empty or whitespace-only input', () => {
    expect(chunkDocument(parseForTest(''), options())).toStrictEqual([]);
    expect(chunkDocument(parseForTest('   \n\n  \t '), options())).toStrictEqual([]);
  });

  it('AC11: preserves Portuguese accents exactly', () => {
    const text =
      'A autenticação exige um cabeçalho de autorização. Não envie a senha em texto puro.';

    const chunks = chunkDocument(parseForTest(text), options());

    expect(chunks[0]?.content).toContain('autenticação');
    expect(chunks[0]?.content).toContain('cabeçalho');
    expect(chunks[0]?.content).toContain('Não');
  });

  it('AC12: is deterministic', () => {
    const text = Array.from(
      { length: 8 },
      (_unused, i) => `# Section ${String(i)}\n\n${paragraph(50)}`,
    ).join('\n\n');
    const document = parseForTest(text);

    expect(chunkDocument(document, options())).toStrictEqual(chunkDocument(document, options()));
  });

  it('AC13: reports offsets that slice the source back to the chunk content', () => {
    const text = ['# Auth', '', paragraph(30), '', '# Limits', '', paragraph(30)].join('\n');
    const document = parseForTest(text);

    const chunks = chunkDocument(document, options());

    for (const chunk of chunks) {
      const sliced = document.text.slice(chunk.charStart, chunk.charEnd);
      // The slice spans the chunk, including any heading and overlap it carries.
      expect(sliced.length).toBeGreaterThan(0);
      const tail = chunk.content.trim().split('\n').at(-1)?.trim() ?? '';
      expect(sliced).toContain(tail.slice(0, 40));
    }
  });

  it('AC14: numbers chunks from zero with no gaps', () => {
    const text = Array.from({ length: 5 }, () => paragraph(60)).join('\n\n');

    const chunks = chunkDocument(parseForTest(text), options());

    expect(chunks.map((chunk) => chunk.ordinal)).toStrictEqual(
      chunks.map((_unused, index) => index),
    );
  });

  it('AC15: records the page range a chunk covers', () => {
    const page1 = 'Authentication is described here in detail.';
    const page2 = 'Rate limiting is described on the second page.';
    const text = `${page1}\n\n${page2}`;
    const document: ParsedDocument = {
      ...parseForTest(text),
      pages: [
        { page: 1, charStart: 0, charEnd: page1.length },
        { page: 2, charStart: page1.length + 2, charEnd: text.length },
      ],
      pageCount: 2,
    };

    const chunks = chunkDocument(document, options({ maxTokens: 1000 }));

    expect(chunks[0]?.pageStart).toBe(1);
    expect(chunks[0]?.pageEnd).toBe(2);
  });

  it('AC16: reports the same start and end page for a chunk on one page', () => {
    const page1 = 'Authentication is described here.';
    const page2 = 'Rate limiting lives on page two.';
    const text = `${page1}\n\n${page2}`;
    const document: ParsedDocument = {
      ...parseForTest(text),
      pages: [
        { page: 1, charStart: 0, charEnd: page1.length },
        { page: 2, charStart: page1.length + 2, charEnd: text.length },
      ],
      pageCount: 2,
    };

    const chunks = chunkDocument(document, options({ maxTokens: 12, overlapTokens: 0 }));

    const firstChunk = chunks[0];
    expect(firstChunk?.pageStart).toBe(1);
    expect(firstChunk?.pageEnd).toBe(1);
  });

  it('AC16b: reports null pages for a format that has none', () => {
    const chunks = chunkDocument(parseForTest('Plain text with no pages at all.'), options());

    expect(chunks[0]?.pageStart).toBeNull();
    expect(chunks[0]?.pageEnd).toBeNull();
  });

  it('AC17: normalises Windows line endings without changing the boundaries', () => {
    const unix = ['# Auth', '', paragraph(30), '', '# Limits', '', paragraph(30)].join('\n');
    const windows = unix.replace(/\n/g, '\r\n');

    const fromUnix = chunkDocument(parseForTest(unix), options());
    const fromWindows = chunkDocument(parseForTest(windows), options());

    expect(fromWindows).toStrictEqual(fromUnix);
    for (const chunk of fromWindows) {
      expect(chunk.content).not.toContain('\r');
    }
  });

  it('AC18: rejects an overlap that is not smaller than the chunk size', () => {
    // A configuration mistake that would otherwise loop forever re-emitting
    // the same text.
    expect(() =>
      chunkDocument(parseForTest(paragraph(200)), options({ maxTokens: 50, overlapTokens: 50 })),
    ).toThrow(/overlap/i);
  });
});
