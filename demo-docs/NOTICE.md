# Demo corpus

The documents in this folder are the sample knowledge base. They describe a
fictional product, **Lumen**, invented for this purpose.

## Provenance

Every file here was written for this repository. Nothing is copied from a third
party, so there is no licence to honour beyond this project's own, and the
corpus can be redistributed with it freely.

That also makes it a better test corpus than real documentation would be: the
answers are known exactly, so a retrieval test can assert that a question
reaches a specific passage rather than hoping it does.

## Contents

| File                 | Language   | What it covers                                     |
| -------------------- | ---------- | -------------------------------------------------- |
| `lumen-api.md`       | English    | Authentication, rate limits, pagination, errors    |
| `lumen-billing.md`   | English    | Invoices, credit notes, webhooks                   |
| `lumen-guia.md`      | Portuguese | The same product, for testing pt-BR retrieval      |
| `lumen-handbook.pdf` | English    | Generated from Markdown, for page-number citations |

`lumen-handbook.pdf` is produced by `pnpm seed`, from `lumen-handbook.md`, so
the PDF is reproducible rather than an opaque binary in version control.

## Swapping in real documentation

Real public documentation is more representative and is worth adding: Fastify
and NestJS both publish theirs under MIT, and a Swagger Petstore spec rendered
to Markdown makes a good endpoint-extraction demo. Anything added here must have
its licence checked and recorded in this file first.
