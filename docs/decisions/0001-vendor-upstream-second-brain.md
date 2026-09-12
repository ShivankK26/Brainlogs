# 0001 — Vendor karanpargal/second-brain instead of forking on GitHub

**Status:** accepted · **Date:** 2026-09-12

## Context

The build brief starts from the MIT-licensed `second-brain` repository. It ships a Tauri shell, a Rust capture engine for three platforms, a Node worker, connectors and an eval suite. Brainlogs changes the product name, the package manager, the data model and most of the UI.

## Decision

Copy upstream `main` into this repository as the first commit (`chore: vendor upstream …`) rather than using GitHub's fork button.

- Attribution lives in `NOTICE.md` and in the `LICENSE` copyright line.
- The upstream lockfile, `.cursor/` rules and the `agents/graph` orchestration docs were not carried over; they describe upstream's own workflow, not ours.
- `apps/web` became `apps/app` in the same commit as the rename so history stays readable.

## Consequences

- No automatic upstream merges. Cherry-picks are possible because file paths are preserved under `apps/desktop` and `packages/*`.
- A GitHub fork would have kept the upstream name and default branch visible on the repository page, which is wrong for a renamed product.
