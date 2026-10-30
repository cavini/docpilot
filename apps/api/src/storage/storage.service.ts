/** Stores and retrieves the original bytes of uploaded documents. */
export abstract class StorageService {
  /**
   * Writes an object, replacing anything already at that key.
   *
   * @param key Where to store it.
   * @param bytes The contents.
   * @param contentType MIME type, recorded so a later read can serve it.
   */
  abstract put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;

  /**
   * Reads an object.
   *
   * @param key Where it was stored.
   * @throws If the object does not exist or cannot be read.
   */
  abstract get(key: string): Promise<Uint8Array>;

  /**
   * Removes an object.
   *
   * Succeeds when the object is already gone: deletion is called on cleanup
   * paths where the object may never have been written, and a failure there
   * would mask the error that caused the cleanup.
   */
  abstract remove(key: string): Promise<void>;

  /** Checks the backend is reachable and writable. */
  abstract probe(): Promise<void>;

  /**
   * Builds the key for a document's original bytes.
   *
   * Derived from the document id, never from the uploaded filename, so a
   * crafted name such as `../../etc/passwd` cannot escape its prefix. The
   * original name is kept in the database as a label only.
   *
   * @param documentId The document's id.
   * @returns The storage key.
   */
  static keyFor(documentId: string): string {
    return `documents/${documentId}/original`;
  }
}
