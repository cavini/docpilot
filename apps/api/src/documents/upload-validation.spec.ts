import { InvalidRequestError, PayloadTooLargeError } from '../common/errors/index.js';
import { type UploadedFile, validateUpload } from './upload-validation.js';

const file = (overrides: Partial<UploadedFile> = {}): UploadedFile => {
  const buffer = overrides.buffer ?? Buffer.from('# Auth\n\nSend a bearer token.');

  return {
    originalname: 'guide.md',
    mimetype: 'text/markdown',
    size: buffer.length,
    buffer,
    ...overrides,
  };
};

const pdfBuffer = (body = 'content') =>
  Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from(body)]);

describe('validateUpload', () => {
  it('AC1: accepts a Markdown file', () => {
    expect(validateUpload(file(), 20).mimeType).toBe('text/markdown');
  });

  it('AC2: accepts a plain text file', () => {
    const result = validateUpload(file({ originalname: 'notes.txt', mimetype: 'text/plain' }), 20);

    expect(result.mimeType).toBe('text/plain');
  });

  it('AC3: accepts a PDF identified by its own bytes', () => {
    const buffer = pdfBuffer();
    const result = validateUpload(
      file({
        originalname: 'manual.pdf',
        mimetype: 'application/pdf',
        buffer,
        size: buffer.length,
      }),
      20,
    );

    expect(result.mimeType).toBe('application/pdf');
  });

  it('AC4: trusts the signature over a wrong declared type', () => {
    // Browsers often send application/octet-stream; the bytes are the truth.
    const buffer = pdfBuffer();
    const result = validateUpload(
      file({
        originalname: 'manual.pdf',
        mimetype: 'application/octet-stream',
        buffer,
        size: buffer.length,
      }),
      20,
    );

    expect(result.mimeType).toBe('application/pdf');
  });

  it('AC5: rejects a file named .pdf that is not one', () => {
    expect(() =>
      validateUpload(file({ originalname: 'trojan.pdf', mimetype: 'application/pdf' }), 20),
    ).toThrow(/not a PDF/);
  });

  it('AC6: rejects an unsupported type', () => {
    const buffer = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

    expect(() =>
      validateUpload(
        file({ originalname: 'archive.zip', mimetype: 'application/zip', buffer, size: 4 }),
        20,
      ),
    ).toThrow(InvalidRequestError);
  });

  it('AC7: rejects an empty file', () => {
    expect(() => validateUpload(file({ buffer: Buffer.alloc(0), size: 0 }), 20)).toThrow(/empty/i);
  });

  it('AC8: rejects a file over the size limit with a 413', () => {
    const big = Buffer.alloc(3 * 1024 * 1024, 'a');

    try {
      validateUpload(file({ buffer: big, size: big.length }), 2);
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PayloadTooLargeError);
      expect((error as PayloadTooLargeError).httpStatus).toBe(413);
    }
  });

  it('AC9: hashes the content, so the same bytes under two names deduplicate', () => {
    const buffer = Buffer.from('identical content');
    const first = validateUpload(file({ originalname: 'a.md', buffer, size: buffer.length }), 20);
    const second = validateUpload(file({ originalname: 'b.md', buffer, size: buffer.length }), 20);

    expect(first.sha256).toBe(second.sha256);
  });

  it('AC10: gives different content different hashes', () => {
    const a = validateUpload(file({ buffer: Buffer.from('one') }), 20);
    const b = validateUpload(file({ buffer: Buffer.from('two') }), 20);

    expect(a.sha256).not.toBe(b.sha256);
  });

  it('AC11: titles the document with the filename minus its extension', () => {
    expect(validateUpload(file({ originalname: 'billing-api.md' }), 20).title).toBe('billing-api');
  });

  it('AC12: strips any directory component from the title', () => {
    // A filename is attacker-controlled; it must not carry a path.
    const result = validateUpload(file({ originalname: '../../etc/passwd.md' }), 20);

    expect(result.title).toBe('passwd');
    expect(result.title).not.toContain('/');
  });

  it('AC13: keeps the original filename as a label', () => {
    expect(validateUpload(file({ originalname: 'guide.md' }), 20).sourceFilename).toBe('guide.md');
  });

  it('AC14: accepts a file at exactly the size limit', () => {
    const exact = Buffer.alloc(1024 * 1024, 'a');

    expect(() => validateUpload(file({ buffer: exact, size: exact.length }), 1)).not.toThrow();
  });
});
