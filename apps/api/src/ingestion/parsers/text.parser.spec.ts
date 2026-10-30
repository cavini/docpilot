import { UnreadableDocumentError } from './parser.js';
import { TextParser } from './text.parser.js';

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('TextParser', () => {
  const parser = new TextParser();

  it('AC1: handles plain text and both Markdown media types', () => {
    expect(parser.supports('text/plain')).toBe(true);
    expect(parser.supports('text/markdown')).toBe(true);
    expect(parser.supports('text/x-markdown')).toBe(true);
    expect(parser.supports('application/pdf')).toBe(false);
  });

  it('AC2: extracts text and structure from Markdown', async () => {
    const parsed = await parser.parse(encode('# Auth\n\nSend a bearer token.'));

    expect(parsed.text).toBe('# Auth\n\nSend a bearer token.');
    expect(parsed.segments.map((s) => s.kind)).toStrictEqual(['heading', 'paragraph']);
  });

  it('AC3: reports no pages, because text files have none', async () => {
    const parsed = await parser.parse(encode('Body.'));

    expect(parsed.pages).toStrictEqual([]);
    expect(parsed.pageCount).toBeNull();
  });

  it('AC4: normalises Windows line endings before measuring offsets', async () => {
    const parsed = await parser.parse(encode('# Auth\r\n\r\nBody text.'));

    expect(parsed.text).not.toContain('\r');
    for (const segment of parsed.segments) {
      expect(parsed.text.slice(segment.charStart, segment.charEnd)).toBe(segment.text);
    }
  });

  it('AC5: preserves Portuguese characters exactly', async () => {
    const parsed = await parser.parse(encode('A autenticação exige um cabeçalho.'));

    expect(parsed.text).toBe('A autenticação exige um cabeçalho.');
  });

  it('AC6: rejects an empty file, which would otherwise sit ready with no chunks', async () => {
    await expect(parser.parse(encode(''))).rejects.toThrow(UnreadableDocumentError);
  });

  it('AC7: rejects a whitespace-only file', async () => {
    await expect(parser.parse(encode('   \n\n  '))).rejects.toThrow(/no text/i);
  });

  it('AC8: rejects binary mislabelled as text rather than embedding replacement characters', async () => {
    const binary = new Uint8Array([0xff, 0xfe, 0x00, 0x01, 0x80, 0x90]);

    await expect(parser.parse(binary)).rejects.toThrow(/UTF-8/);
  });
});
