import { createHash } from 'node:crypto';
import { extname } from 'node:path';

import { InvalidRequestError, PayloadTooLargeError } from '../common/errors/index.js';

/** The file as it arrived, independent of the HTTP framework. */
export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** An upload that has passed validation. */
export interface ValidatedUpload {
  title: string;
  sourceFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  bytes: Uint8Array;
}

/** Extensions mapped to the type the pipeline will parse them as. */
const EXTENSION_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.txt': 'text/plain',
  '.text': 'text/plain',
};

/** First bytes that identify a format, regardless of what the upload claims. */
const SIGNATURES: { mimeType: string; magic: number[] }[] = [
  { mimeType: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
];

/** Reads the type a file's own bytes declare, if it declares one. */
function sniffType(bytes: Uint8Array): string | null {
  for (const { mimeType, magic } of SIGNATURES) {
    if (magic.every((byte, index) => bytes[index] === byte)) {
      return mimeType;
    }
  }

  return null;
}

/**
 * Decides what type a file really is.
 *
 * The declared `Content-Type` is a claim by the client, and browsers are
 * inconsistent about it: a `.md` file often arrives as
 * `application/octet-stream`. The extension is a better hint, and the file's
 * own signature is better still where it has one.
 *
 * A file whose signature contradicts both is rejected: a renamed executable
 * should not be read as a PDF.
 */
function resolveMimeType(file: UploadedFile, bytes: Uint8Array): string {
  const sniffed = sniffType(bytes);
  const byExtension = EXTENSION_TYPES[extname(file.originalname).toLowerCase()];

  if (sniffed) {
    // A real PDF is a PDF even if it was uploaded as something else. The
    // converse — a file claiming to be a PDF that is not one — falls through
    // and is rejected below.
    return sniffed;
  }

  if (byExtension) {
    if (byExtension === 'application/pdf') {
      throw new InvalidRequestError('The file is named .pdf but is not a PDF.');
    }

    return byExtension;
  }

  if (file.mimetype === 'text/plain' || file.mimetype.startsWith('text/')) {
    return 'text/plain';
  }

  throw new InvalidRequestError(
    `Unsupported file type "${file.mimetype}". Upload a PDF, Markdown or plain text file.`,
  );
}

/**
 * Validates an upload and prepares what the database needs.
 *
 * @param file The uploaded file.
 * @param maxUploadMb Size limit, from configuration.
 * @returns The validated upload, including the content hash used to
 *   deduplicate it.
 * @throws {PayloadTooLargeError} If the file exceeds the limit.
 * @throws {InvalidRequestError} If the file is empty or of an unsupported
 *   type.
 *
 * @example
 * ```ts
 * const upload = validateUpload(file, 20);
 * upload.sha256; // dedupe key
 * ```
 */
export function validateUpload(file: UploadedFile, maxUploadMb: number): ValidatedUpload {
  if (file.size === 0 || file.buffer.length === 0) {
    // A zero-byte document would reach `ready` with no chunks and answer
    // nothing, which looks like a bug rather than a rejected upload.
    throw new InvalidRequestError('The file is empty.');
  }

  const maxBytes = maxUploadMb * 1024 * 1024;

  if (file.size > maxBytes) {
    throw new PayloadTooLargeError(`The file is larger than the ${String(maxUploadMb)} MB limit.`);
  }

  const bytes = new Uint8Array(file.buffer);
  const mimeType = resolveMimeType(file, bytes);

  return {
    title: basenameWithoutExtension(file.originalname),
    sourceFilename: file.originalname,
    mimeType,
    sizeBytes: file.size,
    // The hash is over the content, not the name: the same document uploaded
    // under two names is one document, because the content is what is
    // embedded.
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes,
  };
}

/** Strips the directory and extension, for a display title. */
function basenameWithoutExtension(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const extension = extname(base);
  const title = extension ? base.slice(0, -extension.length) : base;

  return title.trim().length > 0 ? title.trim() : base;
}
