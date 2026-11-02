# Spec: Demo contract corpus

Status: implemented Milestone: M5

## Problem and goal

The demo corpus is four documents about one fictional API, and the only
Portuguese among them is a translation of the English. That is enough to prove
retrieval works and not enough to show it off: every question lands in the same
subject, nothing disagrees with anything, and a reader cannot tell whether an
answer was retrieved or guessed from the model's prior knowledge of REST APIs.

I want a second corpus of contracts, in Portuguese and English, that someone can
upload by hand to exercise the parts of the product the API docs do not reach:
long prose with no code in it, numbered clauses, the same agreement under two
jurisdictions with deliberately different numbers, and an amendment that
overrides a figure in the agreement it amends.

Contracts also carry no facts a model already knows. An answer about a notice
period is either retrieved from the document or invented, and a reader can tell
which by following the citation.

## Behaviour

Six documents, as two parallel sets:

| Document                          | Language   | Format | Covers                                    |
| --------------------------------- | ---------- | ------ | ----------------------------------------- |
| `services-agreement-halcyon.md`   | English    | MD/PDF | Term, SLA, fees, liability, governing law |
| `mutual-nda-vireo.md`             | English    | MD     | Confidentiality, carve-outs, non-solicit  |
| `amendment-one-halcyon.txt`       | English    | TXT    | Overrides two figures in the agreement    |
| `acordo-servicos-aurora.md`       | Portuguese | MD/PDF | The same shape, under Brazilian terms     |
| `acordo-confidencialidade-ipe.md` | Portuguese | MD     | Confidentiality, under Brazilian terms    |
| `primeiro-aditivo-aurora.txt`     | Portuguese | TXT    | Overrides two figures in the agreement    |

The two services agreements describe the same vendor selling the same product,
and **disagree on every negotiated number**: term length, notice period, uptime
commitment, payment window, liability cap, how long data survives termination.
That is what makes a cross-document question worth asking, because the right
answer is "it depends which agreement" rather than one figure.

Each amendment changes a figure the agreement states. A question about that
figure is only answered correctly by a system that retrieves both documents and
notices which one is later, so the amendments are the sharpest test in the set.

The parties are invented and every file says so on its first line, because a
file leaves this repository the moment it is uploaded and should not be
mistakable for a real agreement.

The corpus is **not seeded**. `pnpm seed` ingests `demo-docs/` and skips
directories, so these sit one level down in `demo-docs/contracts/` and reach the
index only when somebody uploads them. The hosted demo keeps the corpus it has,
and the embedding spend of this one is paid only by whoever chooses to pay it.

## API contract

None. This adds fixtures and a script that renders two of them to PDF; it adds
no endpoint and changes no response.

The script is `pnpm --filter @docpilot/api contracts:pdf`. It writes to
`demo-docs/contracts/pdf/`, which is ignored by git, so the PDFs are
reproducible rather than committed as binaries nobody can review in a diff.

## Acceptance criteria

**AC1.** Given any file in the contract corpus, when it is parsed by the parser
registered for its type, then parsing succeeds and returns non-empty text.

**AC2.** Given a Portuguese file in the corpus, when its text is passed to
`detectLanguage`, then the result is `portuguese`; and given an English file,
then the result is `english`.

**AC3.** Given an agreement or an NDA, when it is chunked with the configured
chunk size, then at least four chunks are produced, so retrieval has passages to
choose between rather than one passage that always matches. An amendment is
exempt: it is two pages, and the point of it is that one passage contradicts
another document.

**AC4.** Given the two services agreements, when the same negotiated term is
read from each, then the figures differ, so a cross-document question has two
distinct correct answers.

**AC5.** Given an amendment and the agreement it amends, when both are in the
corpus, then the amendment states a figure that contradicts the agreement, and
names the clause it replaces.

**AC6.** Given text containing any character in the Latin-1 range, when a PDF is
built from it and read back by the PDF parser, then the text returned equals the
text put in.

**AC7.** Given a PDF built by `buildPdf`, when it is read, then its
cross-reference table resolves without the reader having to rebuild it.

**AC8.** Given text containing a character outside what the PDF encoding can
represent, when a PDF is built from it, then the build throws naming the
character, rather than writing a substitute into the file.

**AC9.** Given a contract rendered to PDF, when it is read back, then the final
heading and the last line beneath it are both present, so nothing ran off the
bottom of a page and vanished.

## Edge cases and failure modes

**A character outside Latin-1.** The PDF fixtures draw text in Helvetica with
`WinAnsiEncoding`, which covers Portuguese and no further. An em dash and curly
quotes are mapped to their WinAnsi positions; anything else throws (AC8).
Writing `?` instead would put a corrupted fixture into a demo and tell nobody.

**An amendment read without its agreement.** Uploading only the amendment leaves
a figure with nothing to override. The answer should be the amendment's figure,
which is right, and the citation shows it came from an amendment — which is the
honest outcome rather than a failure.

**A contract uploaded twice, once as Markdown and once as PDF.** Content hashes
differ, so both are stored, and a question retrieves from whichever ranks
higher. The NOTICE says to pick one.

## Non-goals

Not legal advice and not a drafting template. The clauses are plausible enough
to ask questions about and are not fit for use.

Not seeded, not part of the hosted demo, and not an extraction schema. The three
schemas in the registry are unchanged; `document_outline` and `faq_pairs` apply
to contracts as they stand, and `api_endpoints` does not apply to a contract at
all, which is correct rather than a gap.

## Test plan

| AC  | Level | File                                                  |
| --- | ----- | ----------------------------------------------------- |
| AC1 | unit  | `apps/api/src/scripts/contract-corpus.spec.ts`        |
| AC2 | unit  | `apps/api/src/scripts/contract-corpus.spec.ts`        |
| AC3 | unit  | `apps/api/src/scripts/contract-corpus.spec.ts`        |
| AC4 | unit  | `apps/api/src/scripts/contract-corpus.spec.ts`        |
| AC5 | unit  | `apps/api/src/scripts/contract-corpus.spec.ts`        |
| AC6 | unit  | `apps/api/src/ingestion/parsers/pdf-encoding.spec.ts` |
| AC7 | unit  | `apps/api/src/ingestion/parsers/pdf-encoding.spec.ts` |
| AC8 | unit  | `apps/api/src/ingestion/parsers/pdf-encoding.spec.ts` |
| AC9 | unit  | `apps/api/src/scripts/contract-corpus.spec.ts`        |

The AC6 to AC8 tests sit in `pdf-encoding.spec.ts` rather than in
`pdf.parser.spec.ts`, which already has an `AC6` of its own from the ingestion
pipeline spec. Two different `AC6`s in one file would break the lookup the
numbering exists for.

## Open questions

Whether the contracts should eventually replace the API corpus as the seeded
one. They are the better demo, but the API corpus is what the retrieval tests
assert against, so moving would mean rewriting those first.
