# 0009 — Graph extraction: deterministic tier first, model tier gated by confidence

**Status:** accepted · **Date:** 2026-09-12

## Context

§8 asks for entity and commitment extraction from a local model plus deterministic extractors, with `proposed` status for low-confidence output, auto-close, stalled/overdue transitions and a Pulse narrative with sentence provenance.

## Decisions

- **Deterministic first, always.** Repos (URLs, git remotes, `owner/name` in terminal output with a stop-list), branches (`git checkout|switch`, `Switched to branch`, `feat/…` prefixes), docs (page titles on Notion/Google Docs/Linear/Confluence/Figma hosts), people (`@mentions`, DM titles, `Name:` speakers) and commitments (first-person promise and request patterns with relative due dates) are extracted without a model. These produce `confirmed` edges and are what the tests cover.
- **Model tier is optional and bounded.** When Ollama answers, chat/email events are sent in batches of six with a strict JSON schema (`format`) and validated with zod. Entities below 0.6 confidence are dropped; between 0.6 and 0.8 they are linked through a `proposed` edge that the user reviews; commitments below 0.8 are dropped. If the model is unreachable the run continues without it. Default model `qwen2.5:7b`, fallback `llama3.2:3b` on a 404.
- **Commitment status at creation.** A promise by you → `open`; a request by you → `waiting`; a request to you → `open`; a promise by someone else → `waiting`. `owes`/`owed_by` edges are written between the two people when both are entities.
- **Lifecycle** runs on every job: a later event that shares ≥2 key terms with the commitment, names the counterpart, and contains a delivery signal (attached, sent, merged, here you go, a file name, …) closes it with `closedByEventId`; no related activity for 3 days → `stalled`; past `dueAt` → `overdue`. `done` and `dismissed` are terminal.
- **Weekly narrative is templated, not generated.** Sentences come from the week's sessions, branch activity, commitments and app switches; each records the event ids it was built from, and entity names are wrapped in `**bold**` so the UI can mark them. A model may later rewrite the prose, but it must keep sentence order so provenance survives.
- **Watermark** is the ts of the last processed event; `full: true` reprocesses everything and relies on idempotent upserts.

## Not done yet

`blocked_by` and `decided` edges have no deterministic source today; `decided` will come from approved decision notes in Phase 5.
