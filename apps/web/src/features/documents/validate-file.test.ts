import { describe, expect, it } from 'vitest';

import { ACCEPTED_EXTENSIONS, checkFile, partitionFiles } from './validate-file';

const MAX = 20 * 1024 * 1024;

/** Builds a file of a given size without allocating that many bytes. */
function fileOf(name: string, size: number): File {
  const file = new File(['x'], name, { type: 'application/octet-stream' });
  Object.defineProperty(file, 'size', { value: size });

  return file;
}

describe('checkFile', () => {
  it.each(ACCEPTED_EXTENSIONS)('accepts %s', (extension) => {
    expect(checkFile(fileOf(`guide${extension}`, 1_000), MAX)).toEqual({ ok: true });
  });

  it('AC4: refuses an extension the API cannot read', () => {
    expect(checkFile(fileOf('guide.docx', 1_000), MAX)).toEqual({
      ok: false,
      reason: 'unsupportedType',
    });
  });

  it('AC4: matches the extension case-insensitively', () => {
    // A file off a Windows share is routinely `GUIDE.PDF`.
    expect(checkFile(fileOf('GUIDE.PDF', 1_000), MAX)).toEqual({ ok: true });
  });

  it('AC4: judges by extension, not by the declared type', () => {
    // Browsers are inconsistent: a `.md` file routinely arrives as
    // application/octet-stream, and refusing it here would reject something
    // the server would have accepted.
    const file = new File(['# Guide'], 'guide.md', { type: 'application/octet-stream' });

    expect(checkFile(file, MAX)).toEqual({ ok: true });
  });

  it('AC5: refuses a file over the limit', () => {
    expect(checkFile(fileOf('big.pdf', MAX + 1), MAX)).toEqual({ ok: false, reason: 'tooLarge' });
  });

  it('AC5: accepts a file exactly at the limit', () => {
    expect(checkFile(fileOf('exact.pdf', MAX), MAX)).toEqual({ ok: true });
  });

  it('refuses an empty file', () => {
    // It would reach `ready` with no passages and answer nothing, which looks
    // like a broken product rather than a rejected upload.
    expect(checkFile(fileOf('empty.md', 0), MAX)).toEqual({ ok: false, reason: 'empty' });
  });

  it('reports the unsupported type before the size, for a file that is both', () => {
    expect(checkFile(fileOf('huge.docx', MAX + 1), MAX)).toEqual({
      ok: false,
      reason: 'unsupportedType',
    });
  });
});

describe('partitionFiles', () => {
  it('uploads the valid files from a mixed batch rather than failing all of them', () => {
    const { accepted, rejected } = partitionFiles(
      [fileOf('a.md', 10), fileOf('b.docx', 10), fileOf('c.pdf', 10)],
      MAX,
    );

    expect(accepted.map((file) => file.name)).toEqual(['a.md', 'c.pdf']);
    expect(rejected).toEqual([{ name: 'b.docx', reason: 'unsupportedType' }]);
  });

  it('returns empty lists for an empty batch', () => {
    expect(partitionFiles([], MAX)).toEqual({ accepted: [], rejected: [] });
  });
});
