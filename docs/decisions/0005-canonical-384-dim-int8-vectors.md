# 0005 — Canonical 384-dimension int8 chunk vectors

**Status:** accepted · **Date:** 2026-09-12

## Context

Two embedding backends are supported: Ollama (`nomic-embed-text`, 768 dims) and the offline transformers.js fallback (`bge-small-en-v1.5`, 384 dims). A vec0 table has a fixed dimension, and mixing backends on one machine (Ollama installed later, or stopped) would otherwise corrupt search.

## Decision

`chunk_vec` is `int8[384]`. `nomic-embed-text` v1.5 is a Matryoshka model, so its 768-dim output is truncated to the first 384 dims and re-normalised, which the model authors document as supported. `bge-small` is 384 native. Vectors are quantised to int8 (scale 127) before insert; sqlite-vec's `vec_int8()` distance is used for search. Upstream's 768-dim `memory_chunks_vec` stays for legacy retrieval until it is retired.

## Consequences

- Storage per chunk is 384 bytes. A heavy month (~150k chunks) is ~55 MB of vectors.
- Switching backends does not require a rebuild; recall drops slightly on the truncated backend, which is acceptable for a local memory where BM25 carries exact-term queries.
