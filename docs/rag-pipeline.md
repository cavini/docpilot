# The RAG pipeline

How a document becomes something a question can be answered from: parsing,
chunking, embedding, storage, and the search that finds the right passage again.

> **Status:** written in M1 and M2, alongside the code it describes.
> Documentation is committed with the feature, never batched at the end, so
> nothing here describes behaviour that does not exist yet.

## Planned contents

- Parsing per format, and how page numbers and heading paths survive it.
- The chunking strategy: size, overlap, why structure-aware splitting beats
  fixed windows, and what happens to code blocks.
- The embedding model: dimensions, cost, quality, and what changing it would
  require.
- Storage and indexes: HNSW against IVFFlat, why cosine distance.
- Hybrid search and Reciprocal Rank Fusion, with a worked numeric example.
- Optional reranking, and whether it earns its latency.
- Context assembly, the prompt, and how citations are mapped back to chunks.
- What would change at a hundred times the corpus size.
