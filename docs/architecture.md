# Brainlog architecture

Brainlog runs quietly on a user's computer, captures the **text** of what they see (window titles, URLs, on-screen text via accessibility APIs, terminal output) and stores it locally in SQLite. A small local model turns that stream into an **entity graph** (people, projects, repos, commitments) linked back to source events. The user can search their past in plain language and get back the **moment**: what was on screen and what they did next. Coding agents query the same memory over a local **MCP** socket and write notes back, held as *proposed* until the user approves. Nothing leaves the machine.

## Principles (non-negotiable)

1. **Local-only by default.** No account, no upload, no telemetry. Network calls are optional and user-enabled: Ollama on localhost, an optional cloud "Ask" model, optional read-only connectors.
2. **Text, not pixels.** Screenshots are never written to disk. OCR bitmaps live in memory only.
3. **Propose-only for agents.** Any agent write is `status: proposed` until the user approves it in the UI.
4. **Provenance everywhere.** Every entity, edge, commitment and summary sentence links to source event ids. Deleting an event cascades.
5. **Short half-life for raw text, long life for structure.** Raw text expires (default 30 days). The graph and summaries persist.
6. **Policy beats convenience.** Blocklists and sensitivity tags are enforced in the capture and query layers. Agents cannot override them.

## Monorepo

pnpm workspaces + Turborepo. Node 22, TypeScript strict, ESM only.

```
apps/
  desktop/   Tauri 2 shell + Rust capture engine (upstream)
  app/       React in-app UI (upstream apps/web, rewritten in Phase 3)
  site/      Landing page + docs (Astro, Phase 6)
packages/
  types/     zod schemas + TS types. Zero runtime deps except zod.
  core/      config, secrets, SQLite/Drizzle, migrations, backups (upstream)
  capture/   spool ingestion, dedup, diffing (upstream, extended)
  enrich/    embeddings + FTS5 + sqlite-vec (upstream, extended)
  graph/     entity/commitment extraction, edge store, graph queries (Phase 4)
  query/     unified query API used by app, MCP, CLI, digest (Phase 2)
  agents/    local model jobs: loops, digest, weekly narrative (upstream, extended)
  policy/    blocklists, sensitivity classifier, agent permissions, audit log (Phase 2)
  mcp/       MCP server: thin adapter over query + policy (Phase 5)
  worker/    scheduler + HTTP API bound to 127.0.0.1 (upstream)
  cli/       `brainlog` CLI (Phase 2)
  connectors/ read-only Gmail/Calendar/GitHub (upstream)
  ui/        design tokens + shared React components
  evals/     upstream fixtures and eval tests
tooling/
  tsconfig/  base tsconfigs
  eslint/    shared flat config
  release/   Tauri signing, changesets, GitHub Releases (Phase 6)
docs/
  architecture.md, privacy.md, mcp.md, decisions/
```

Dependency rules:

- Everything imports types from `@brainlog/types`.
- `@brainlog/query` is the only read path for `apps/app`, `packages/mcp`, `packages/cli` and `packages/agents`. No direct SQL outside `core`, `graph`, `enrich`, `query`.
- `@brainlog/policy` is consulted on every capture write and every query read. It is not bypassable from `mcp`.
- Turborepo: `build` depends on `^build`; `test`, `typecheck`, `lint` are cached; `dev` is persistent.

## Data flow

```
Rust capture engine ──JSONL spool──▶ packages/capture (policy gate, dedup, diff, ingest)
                                              ▼
                                     packages/core (SQLite: events, chunks, fts5, vec0)
                                              ▼
                     scheduled jobs (packages/worker)
                       enrich: chunk → embed → sqlite-vec
                       graph:  extract entities/commitments → edges
                       agents: open loops, daily/weekly summaries
                       policy: sensitivity tagging, retention purge
                                              ▼
                                     packages/query  ◀── packages/policy (gate + audit)
                        ┌──────────┬──────────┼──────────┐
                     apps/app  packages/mcp  packages/cli  agents/digest
```

All services bind to `127.0.0.1`. The worker writes its port to `~/.brainlog/port`; the app and CLI read it. MCP is served over stdio and over `~/.brainlog/mcp.sock` (named pipe on Windows).

## Data model

See `packages/types/src/*.ts` for the zod definitions of `Event`, `Chunk`, `Entity`, `Edge`, `Commitment`, `Summary`, `Note`, `AuditEntry` and `Policy`. The Drizzle schema in `packages/core` mirrors them. FTS5 and vec0 tables are created by custom migrations; the sqlite-vec extension is loaded **before** migrations run.

Retention (daily): delete `events` and `chunks` past `expiresAt`; keep entities, edges, commitments and summaries; replace evidence links to expired events with `{ eventId, expired: true, tsSnapshot }`.

## Phases

| Phase | Deliverable |
|---|---|
| 0 | Repo bootstrap: vendor upstream, rename, pnpm + Turborepo, `types`, `ui`, `tooling`, docs |
| 1 | Types, core schema (FTS5 + vec0), capture dedup/diff/sampling, policy gate at capture |
| 2 | `query` (RRF ranking, `moment()`), `policy` (gate + audit), CLI |
| 3 | In-app UI on real data, keyboard shortcuts, command palette, Playwright tests |
| 4 | Graph + commitments: extraction, resolution, auto-close, Pulse narrative with provenance |
| 5 | MCP tools, proposed-write flow, approvals, docs for Claude Code and Cursor |
| 6 | Landing site, docs, signing, GitHub Releases, security checklist, `v1.0.0` |

Decisions that were not obvious are recorded one per file in `docs/decisions/`.
