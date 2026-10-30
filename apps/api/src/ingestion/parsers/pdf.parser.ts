import { Injectable } from '@nestjs/common';

import { type PageSpan, type ParsedDocument, type Segment } from '../chunker/index.js';
import { normaliseText, parseBlocks } from './block-parser.js';
import { type Parser, UnreadableDocumentError } from './parser.js';

/** Separator inserted between pages in the joined text. */
const PAGE_SEPARATOR = '\n\n';

/** Reads PDFs, keeping page numbers so citations can name a page. */
@Injectable()
export class PdfParser implements Parser {
  supports(mimeType: string): boolean {
    return mimeType === 'application/pdf';
  }

  /**
   * Extracts text page by page and records where each page starts and ends.
   *
   * Pages are extracted separately and then joined, rather than extracted as
   * one string, because the page boundaries are the only way a chunk can later
   * say "page 7" in a citation. Reconstructing them from a merged string is
   * guesswork.
   *
   * `unpdf` is used rather than `pdfjs-dist` directly: it bundles a build of
   * pdf.js that runs in Node with no extra configuration, and it has no
   * dependencies of its own.
   *
   * @param bytes PDF contents.
   * @returns The parsed document, with page spans.
   * @throws {UnreadableDocumentError} If the file is not a readable PDF, or
   *   has no text layer, which is what a scan without OCR looks like.
   */
  async parse(bytes: Uint8Array): Promise<ParsedDocument> {
    // Imported lazily so that starting the API, or exporting the OpenAPI
    // spec, does not pay for loading a PDF engine.
    const { extractText, getDocumentProxy } = await import('unpdf');

    let pageTexts: string[];
    let pageCount: number;

    try {
      const proxy = await getDocumentProxy(bytes);
      const extracted = await extractText(proxy, { mergePages: false });

      pageTexts = extracted.text.map((page) => normaliseText(page));
      pageCount = extracted.totalPages;
    } catch (cause) {
      throw new UnreadableDocumentError('The file could not be read as a PDF.', { cause });
    }

    const pages: PageSpan[] = [];
    const segments: Segment[] = [];
    const parts: string[] = [];
    let offset = 0;

    for (const [index, pageText] of pageTexts.entries()) {
      pages.push({ page: index + 1, charStart: offset, charEnd: offset + pageText.length });
      segments.push(...parseBlocks(pageText, offset));
      parts.push(pageText);
      offset += pageText.length + PAGE_SEPARATOR.length;
    }

    const text = parts.join(PAGE_SEPARATOR);

    if (text.trim().length === 0) {
      throw new UnreadableDocumentError(
        'No text could be extracted. The PDF may be a scan without a text layer, which needs OCR.',
      );
    }

    return { text, segments, pages, pageCount };
  }
}
