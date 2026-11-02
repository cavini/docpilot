# Contract corpus

Six contracts, in Portuguese and English, written for this repository so that
someone can upload them by hand and put the product through the parts of itself
the API corpus one folder up does not reach: long prose with no code in it,
numbered clauses, and figures that disagree between documents.

Every party named here is invented. Nothing in these files is legal advice, and
none of it is fit to be used as a contract.

## Contents

| File                              | Language   | Upload as | What it is                        |
| --------------------------------- | ---------- | --------- | --------------------------------- |
| `services-agreement-halcyon.md`   | English    | PDF       | 13-clause payments MSA            |
| `mutual-nda-vireo.md`             | English    | Markdown  | Mutual NDA                        |
| `amendment-one-halcyon.txt`       | English    | Text      | Amends three clauses of the MSA   |
| `acordo-servicos-aurora.md`       | Portuguese | PDF       | The same MSA, under Brazilian law |
| `acordo-confidencialidade-ipe.md` | Portuguese | Markdown  | Mutual NDA                        |
| `primeiro-aditivo-aurora.txt`     | Portuguese | Text      | Amends four clauses of the MSA    |

The two marked **PDF** are rendered from their Markdown by
`pnpm --filter @docpilot/api contracts:pdf`, which writes them to `pdf/`. That
folder is ignored by git, because a binary in version control is a file nobody
can review a change to.

Upload each document once: the Markdown or the PDF, not both. Content hashes
differ between the two formats, so uploading both stores two copies of one
contract and a question retrieves from whichever happens to rank higher.

## What the corpus is built to test

**Two languages over the same subject.** The two services agreements describe
the same vendor selling the same product, and are not translations of each
other. Asking the same question of each should reach the right document in the
language it was asked in.

**Figures that disagree on purpose.** Every negotiated number differs between
the two agreements: term, notice period, uptime commitment, payment window,
liability cap, how long data survives termination. A question like "what is the
notice period" has no single right answer, which is the point - the citation is
what tells a reader which agreement an answer came from.

**An amendment that overrides its agreement.** Each amendment is dated months
after the agreement it amends, names the clauses it replaces, and states figures
the agreement contradicts. Uploading an agreement and its amendment and then
asking about uptime is the sharpest question in the set, because answering it
correctly means noticing which document is later.

**Three formats.** Markdown, plain text, and PDF, in both languages. The PDFs
carry page numbers into citations; the plain text amendments have no headings at
all, so they exercise the chunker where it has no structure to cut along.

**Extraction.** `document_outline` finds the clause headings, and `faq_pairs`
works well on an agreement because a contract is a list of answers to questions
somebody once asked. `api_endpoints` finds nothing in a contract, which is the
correct result rather than a gap.

## Why these are not seeded

`pnpm seed` ingests `demo-docs/` and skips directories, so nothing here reaches
the hosted demo unless somebody uploads it. That keeps the demo's corpus and its
embedding spend as they are, and leaves this folder as something to pull from
deliberately.

## Provenance

Every file was written for this repository. Nothing is copied from a third
party, so there is no licence to honour beyond this project's own, and the
corpus can be redistributed with it freely.

The clauses are plausible rather than authoritative. They are built to be asked
questions about, and the answers are known exactly, which is what makes a
retrieval test able to assert that a question reached a particular passage
rather than hope it did.
