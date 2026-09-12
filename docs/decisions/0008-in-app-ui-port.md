# 0008 — In-app UI: state-driven views, heuristics until the graph lands

**Status:** accepted · **Date:** 2026-09-12

## Decisions

- **No router, no component library, no Tailwind.** Views are selected by store state (`page`), which is what the reference's keyboard model (`g` then `p/m/c/a`, `⌘K`) needs. Styles are a 1:1 port of the reference CSS on top of `@brainlog/ui` tokens. The upstream Tailwind widget was removed; `/widget` is a small search surface using the same client.
- **Data only through `/api/v1`.** The app never sees SQL or the query package at runtime; it imports `@brainlog/types` for shapes and mirrors the few response types locally so the browser bundle stays free of Node code.
- **Display ids.** `MEM-XXXX` / `CMT-XXXX` are the first four hex characters of the row id. Sequential numbers would need a global counter that survives purges; the short hash is stable and copyable.
- **Status and priority are heuristics until Phase 4.** An event is *Overdue* when it is evidence for an overdue commitment, *Open* when linked to an open one, *In progress* when it is a terminal capture that mentions an error, otherwise *Seen*. Priority follows the same signals plus sensitivity. Phase 4 replaces this with graph links.
- **Pulse KPIs are computed on read** from the week's timeline (sessions with a 5-minute gap, 30 s minimum per event, app switches, audit rows by agents). They are cheap at the current scale; a materialised weekly row can come with summaries.
- **Sentence provenance** on the Pulse narrative opens Memory with an `ids` filter, so the evidence list is exactly what the summary cited.
- **Playwright runs against a real worker** seeded from the capture fixture spool plus a few graph rows, not against mocks, so the tests exercise auth cookies, gating and the audit log too.
