# 0003 — Keep upstream tables, add the Brainlog model alongside

**Status:** accepted · **Date:** 2026-09-12

## Context

Upstream stores `observations`, `activity_blocks`, `artifacts`, `open_loops`, `memory_chunks` and a dozen support tables. The Brainlog brief specifies a different, smaller model: `events`, `chunks`, `entities`, `edges`, `commitments`, `summaries`, `notes`, `audit_entries`, `policy`.

Rewriting the ~30k lines of upstream agents, connectors and evals against the new tables in Phase 1 would stall every later phase.

## Decision

Add the Brainlog tables as the canonical model and keep the upstream tables running in parallel. New code (`capture` ingest, `query`, `policy`, `graph`, `mcp`, `cli`, `apps/app`) reads and writes only Brainlog tables. Upstream jobs that still use the old tables are kept behind the worker scheduler until they are ported or retired.

Where upstream tables overlap (`observations` ≈ `events`, `open_loops` ≈ `commitments`), the capture ingester writes the Brainlog table only. Upstream loop detection is fed from `events` through a small adapter when Phase 4 lands.

## Consequences

- One SQLite file, two generations of tables during the transition. Retention purge covers both.
- `packages/evals` keeps passing unchanged, which protects the upstream chat-segmentation and loop-validation logic we still rely on.
- Old tables are removed in a later ADR once nothing reads them.
