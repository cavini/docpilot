/** Extensions the API can read, lowercase and with the dot. */
export const ACCEPTED_EXTENSIONS = ['.pdf', '.md', '.markdown', '.txt'] as const;

/** `accept` attribute for a file input, derived from the list above. */
export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.join(',');

/** Why a file was refused. A translation key, not a message. */
export type RejectionReason = 'unsupportedType' | 'tooLarge' | 'empty';

/** Outcome of checking one file. */
export type FileCheck = { ok: true } | { ok: false; reason: RejectionReason };

/**
 * Checks a file before it is uploaded.
 *
 * A convenience, never a guarantee. The API validates again — and more
 * thoroughly, since it reads the file's own signature rather than trusting the
 * name — because anything checked only in the browser is not checked at all.
 * What this buys is an instant, specific answer instead of a round trip to
 * learn that a `.docx` was never going to work.
 *
 * The extension is checked rather than the MIME type because browsers are
 * inconsistent about the latter: a `.md` file routinely arrives as
 * `application/octet-stream`, and refusing it here would reject a file the
 * server would have accepted.
 *
 * @param file The file the reader chose.
 * @param maxBytes Upload ceiling, from `NEXT_PUBLIC_MAX_UPLOAD_MB`.
 * @returns Whether to upload it, and why not when not.
 *
 * @example
 * ```ts
 * const check = checkFile(file, 20 * 1024 * 1024);
 * if (!check.ok) setError(t(`upload.rejected.${check.reason}`));
 * ```
 */
export function checkFile(file: File, maxBytes: number): FileCheck {
  const name = file.name.toLowerCase();
  const supported = ACCEPTED_EXTENSIONS.some((extension) => name.endsWith(extension));

  if (!supported) {
    return { ok: false, reason: 'unsupportedType' };
  }

  // A zero-byte file would reach `ready` with no passages and answer nothing,
  // which looks like a broken product rather than a rejected upload.
  if (file.size === 0) {
    return { ok: false, reason: 'empty' };
  }

  if (file.size > maxBytes) {
    return { ok: false, reason: 'tooLarge' };
  }

  return { ok: true };
}

/** A file that was refused, with the reason, for reporting back to the reader. */
export interface RejectedFile {
  name: string;
  reason: RejectionReason;
}

/**
 * Splits a batch of chosen files into those to upload and those to refuse.
 *
 * Partitioning rather than failing the whole batch: dropping three valid files
 * and one `.docx` should upload the three.
 *
 * @param files Everything the reader chose or dropped.
 * @param maxBytes Upload ceiling.
 * @returns The accepted files and the refused ones with their reasons.
 */
export function partitionFiles(
  files: readonly File[],
  maxBytes: number,
): { accepted: File[]; rejected: RejectedFile[] } {
  const accepted: File[] = [];
  const rejected: RejectedFile[] = [];

  for (const file of files) {
    const check = checkFile(file, maxBytes);

    if (check.ok) {
      accepted.push(file);
    } else {
      rejected.push({ name: file.name, reason: check.reason });
    }
  }

  return { accepted, rejected };
}
