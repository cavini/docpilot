import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/** Format a contract is uploaded as. */
export type ContractFormat = 'markdown' | 'text' | 'pdf';

/** What a document is, which decides what may be asserted about it. */
export type ContractRole = 'agreement' | 'nda' | 'amendment';

/** Language a contract is written in, as `detectLanguage` names it. */
export type ContractLanguage = 'english' | 'portuguese';

/** One document in the contract corpus. */
export interface ContractFixture {
  /** File name, relative to the corpus directory. */
  file: string;
  /** The language its text is written in. */
  language: ContractLanguage;
  /** What kind of document it is. */
  role: ContractRole;
  /** What a reader uploads it as. */
  format: ContractFormat;
}

/**
 * Where the contract corpus lives.
 *
 * Resolved from this file rather than from the working directory, because the
 * test suite, the render script and Turbo all start from different places, and
 * a corpus that only one of them can find is worse than no corpus.
 *
 * The same number of steps works from `src/scripts` under Jest and from
 * `dist/scripts` after a build, because `nest build` mirrors the source tree.
 * If that ever stops being true the script fails on a missing file, loudly.
 */
export const CONTRACTS_DIR = resolve(__dirname, '..', '..', '..', '..', 'demo-docs', 'contracts');

/** Where rendered PDFs are written. Ignored by git; see the corpus NOTICE. */
export const CONTRACTS_PDF_DIR = join(CONTRACTS_DIR, 'pdf');

/**
 * The corpus, as uploaded.
 *
 * Two parallel sets, one per language, covering all three formats the pipeline
 * reads. The `pdf` entries name their Markdown source: the PDF is rendered
 * from it rather than committed, so there is one text to review in a diff and
 * one text to keep in step with its counterpart in the other language.
 */
export const CONTRACT_FIXTURES: readonly ContractFixture[] = [
  {
    file: 'services-agreement-halcyon.md',
    language: 'english',
    role: 'agreement',
    format: 'pdf',
  },
  {
    file: 'mutual-nda-vireo.md',
    language: 'english',
    role: 'nda',
    format: 'markdown',
  },
  {
    file: 'amendment-one-halcyon.txt',
    language: 'english',
    role: 'amendment',
    format: 'text',
  },
  {
    file: 'acordo-servicos-aurora.md',
    language: 'portuguese',
    role: 'agreement',
    format: 'pdf',
  },
  {
    file: 'acordo-confidencialidade-ipe.md',
    language: 'portuguese',
    role: 'nda',
    format: 'markdown',
  },
  {
    file: 'primeiro-aditivo-aurora.txt',
    language: 'portuguese',
    role: 'amendment',
    format: 'text',
  },
] as const;

/**
 * Finds the one fixture with a given role and language.
 *
 * @param role What kind of document.
 * @param language Which language.
 * @returns The fixture.
 * @throws If the corpus holds no such document, which means the manifest and
 *   the folder have drifted apart.
 */
export function contractFixture(role: ContractRole, language: ContractLanguage): ContractFixture {
  const found = CONTRACT_FIXTURES.find(
    (fixture) => fixture.role === role && fixture.language === language,
  );

  if (!found) {
    throw new Error(`The contract corpus has no ${language} ${role}.`);
  }

  return found;
}

/**
 * Reads one fixture's source text.
 *
 * @param fixture The fixture to read.
 * @returns Its contents, as written.
 */
export async function readContract(fixture: ContractFixture): Promise<string> {
  return readFile(join(CONTRACTS_DIR, fixture.file), 'utf8');
}
