import { normaliseText, parseBlocks } from './block-parser.js';

describe('normaliseText', () => {
  it('AC1: converts Windows line endings', () => {
    expect(normaliseText('a\r\nb')).toBe('a\nb');
  });

  it('AC2: converts lone carriage returns', () => {
    expect(normaliseText('a\rb')).toBe('a\nb');
  });

  it('AC3: leaves Unix line endings alone', () => {
    expect(normaliseText('a\nb')).toBe('a\nb');
  });
});

describe('parseBlocks', () => {
  it('AC4: recognises ATX headings and their level', () => {
    const segments = parseBlocks('# Title\n\n## Section\n\nBody text.');

    expect(segments.map((s) => [s.kind, s.level ?? null, s.text])).toStrictEqual([
      ['heading', 1, '# Title'],
      ['heading', 2, '## Section'],
      ['paragraph', null, 'Body text.'],
    ]);
  });

  it('AC5: recognises Setext headings', () => {
    const segments = parseBlocks('Title\n=====\n\nBody.');

    expect(segments[0]?.kind).toBe('heading');
    expect(segments[0]?.level).toBe(1);
    expect(segments[0]?.text).toBe('Title');
  });

  it('AC6: keeps a fenced code block as one segment, fences included', () => {
    const text = [
      'Intro.',
      '',
      '```ts',
      'const a = 1;',
      '',
      'const b = 2;',
      '```',
      '',
      'Outro.',
    ].join('\n');

    const segments = parseBlocks(text);
    const code = segments.find((s) => s.kind === 'code');

    // The blank line inside the fence must not split the block.
    expect(code?.text).toBe('```ts\nconst a = 1;\n\nconst b = 2;\n```');
    expect(segments.filter((s) => s.kind === 'code')).toHaveLength(1);
  });

  it('AC7: does not treat a hash inside a fence as a heading', () => {
    const segments = parseBlocks('```sh\n# not a heading\n```');

    expect(segments).toHaveLength(1);
    expect(segments[0]?.kind).toBe('code');
  });

  it('AC8: splits paragraphs on blank lines', () => {
    const segments = parseBlocks('One.\n\nTwo.\n\n\nThree.');

    expect(segments.map((s) => s.text)).toStrictEqual(['One.', 'Two.', 'Three.']);
  });

  it('AC9: reports offsets that slice the source back exactly', () => {
    const text = '# Title\n\nSome body text here.\n\n```js\nx();\n```';

    for (const segment of parseBlocks(text)) {
      expect(text.slice(segment.charStart, segment.charEnd)).toBe(segment.text);
    }
  });

  it('AC10: applies a base offset, so per-page parsing reports document offsets', () => {
    const page = 'Body on the second page.';
    const segments = parseBlocks(page, 100);

    expect(segments[0]?.charStart).toBe(100);
    expect(segments[0]?.charEnd).toBe(100 + page.length);
  });

  it('AC11: treats an unterminated fence as code rather than discarding it', () => {
    const segments = parseBlocks('```ts\nconst a = 1;');

    expect(segments).toHaveLength(1);
    expect(segments[0]?.kind).toBe('code');
    expect(segments[0]?.text).toContain('const a = 1;');
  });

  it('AC12: produces nothing for empty or whitespace-only input', () => {
    expect(parseBlocks('')).toStrictEqual([]);
    expect(parseBlocks('  \n\n \t ')).toStrictEqual([]);
  });

  it('AC13: keeps list and table lines together as one block', () => {
    const segments = parseBlocks('- one\n- two\n- three');

    expect(segments).toHaveLength(1);
    expect(segments[0]?.text).toBe('- one\n- two\n- three');
  });
});
