import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { CONTRACTS_PDF_DIR, CONTRACT_FIXTURES, readContract } from './contract-corpus.js';
import { renderContractPdf } from './render-contract-pdf.js';

/**
 * Renders the contract corpus's PDF documents from their Markdown sources.
 *
 * The PDFs are generated rather than committed, for the reason the demo
 * corpus's handbook is: a binary in version control is a file no reviewer can
 * read a change to. The Markdown is the document; this is a format of it.
 *
 * Run with `pnpm --filter @docpilot/api contracts:pdf`.
 */
async function buildContractPdfs(): Promise<void> {
  await mkdir(CONTRACTS_PDF_DIR, { recursive: true });

  const sources = CONTRACT_FIXTURES.filter((fixture) => fixture.format === 'pdf');

  for (const fixture of sources) {
    const markdown = await readContract(fixture);
    const name = `${basename(fixture.file, '.md')}.pdf`;
    const bytes = renderContractPdf(markdown);

    await writeFile(join(CONTRACTS_PDF_DIR, name), bytes);
    process.stdout.write(`${name}: ${String(Math.round(bytes.length / 1024))} KB\n`);
  }

  process.stdout.write(`Written to ${CONTRACTS_PDF_DIR}\n`);
}

void buildContractPdfs();
