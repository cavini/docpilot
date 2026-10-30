import { Injectable } from '@nestjs/common';

import { type ParsedDocument } from '../chunker/index.js';
import { type Parser, UnreadableDocumentError } from './parser.js';
import { PdfParser } from './pdf.parser.js';
import { TextParser } from './text.parser.js';

/**
 * Picks the parser for a document's type.
 *
 * A registry rather than a switch so that adding a format is adding a class
 * and listing it here, and so the ingestion processor depends on the idea of
 * "a parser" rather than on the set that happens to exist today.
 */
@Injectable()
export class ParserRegistry {
  private readonly parsers: Parser[];

  constructor(pdf: PdfParser, text: TextParser) {
    this.parsers = [pdf, text];
  }

  /**
   * Parses a document with whichever parser handles its type.
   *
   * @param mimeType The document's MIME type.
   * @param bytes Its contents.
   * @returns The parsed document.
   * @throws {UnreadableDocumentError} If no parser handles the type, or the
   *   chosen parser cannot read the bytes.
   */
  async parse(mimeType: string, bytes: Uint8Array): Promise<ParsedDocument> {
    const parser = this.parsers.find((candidate) => candidate.supports(mimeType));

    if (!parser) {
      throw new UnreadableDocumentError(`No parser handles ${mimeType}.`);
    }

    return parser.parse(bytes);
  }
}
