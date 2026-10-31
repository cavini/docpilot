# 0004. The Vercel AI SDK rather than LangChain or LlamaIndex

- **Status:** accepted
- **Date:** 2026-10-30

## Context

The project needs to call models for embeddings, answers, structured output and
tool calling, across more than one provider, from a NestJS backend and later a
React front end.

The obvious candidates are a framework that supplies the whole RAG pipeline —
LangChain or LlamaIndex — or a thin provider-agnostic SDK with the pipeline
written here.

## Decision

Use the **Vercel AI SDK** and write the retrieval pipeline directly.

- `embedMany` for batched embeddings, with the provider's batch limit handled by
  the SDK.
- `generateText` for answers, `streamText` for the chat interface, tools and
  structured output through the same surface.
- Provider selected by configuration: OpenAI, Anthropic, or a deterministic
  mock.
- The AI SDK's UI package shares the streaming protocol with the front end, so
  the Nest endpoint and the React hook agree without a protocol written by hand.

## Why not LangChain

The honest version: LangChain would have written most of M1 and M2 for me, and I
would not be able to explain any of it.

Concretely:

**The abstractions hide the decisions worth making.** A LangChain retriever
takes a chunking strategy, a fusion method and a prompt template as
configuration. Those three choices _are_ the engineering in a RAG system. The
chunker in this repository is 230 lines I can defend line by line; as a
`RecursiveCharacterTextSplitter` argument it would be a number I picked because
the tutorial used it.

**Debugging goes through the framework.** When retrieval returns the wrong
passage, the question is whether the embedding is wrong, the fusion is wrong, or
the query is wrong. Here that is three functions with tests. Through a chain, it
is a stack trace in someone else's abstraction and a search for which callback
exposes the intermediate value.

**The surface area is enormous and moves quickly.** The project needs
embeddings, generation, tools and structured output. LangChain supplies those
plus hundreds of integrations, each a version to track.

What is given up is real: LangChain ships document loaders for dozens of
formats, a large set of retrievers, and agent patterns that would otherwise be
written. For a project whose purpose is to demonstrate understanding of how RAG
works, having written them is the point.

## Why not LlamaIndex

The same argument, more so: LlamaIndex is more opinionated about ingestion and
indexing specifically, which is precisely the part this project exists to show.

## Why not each provider's own SDK

Using `openai` and `@anthropic-ai/sdk` directly would mean writing an
abstraction over them — which is what the AI SDK already is, tested and
maintained. More importantly, it would make the deterministic mock provider
hard: the AI SDK's test models implement the same interface as a real provider,
so `LLM_PROVIDER=mock` goes through the **same factory and the same call path**
as production. There is no `if (test)` branch anywhere in business code, which
means the path under test is the path that ships.

## Consequences

- Every piece of the pipeline — chunking, fusion, prompt assembly, citation
  resolution — is code in this repository, with tests, that can be explained and
  changed.
- Switching provider is one environment variable.
- The whole test suite runs with no API key and no cost, because the mock models
  satisfy the same interface.
- More code to maintain than a framework would need. That is the trade, taken
  deliberately.
- The AI SDK moves fast and its major versions have changed shape. Two examples
  from building this: `textEmbeddingModel` is deprecated in favour of
  `embedding`, and `system` in favour of `instructions`. Pinned versions and
  type-aware linting caught both; this is a dependency to track rather than
  trust.
