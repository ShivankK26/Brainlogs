# Changelog

## 1.0.9 — 2026-09-14

- The purple tile is now the app icon, favicon, sidebar workspace tile and social image; the mono mark stays next to text and in the menu bar. Brand guidelines updated.

## 1.0.8 — 2026-09-14

- New Brainlogs identity: the Loop B mark (two open loops on a stem, faded older loop, purple dot). Applied to the app icon, menu-bar template icon, favicons, in-app wordmark, landing page, README and a social image. Brand guidelines in `docs/brand.md` and on the site.

## 1.0.7 — 2026-09-14

- No more keychain password prompts: the master key defaults to the user-only `master.key` file; the OS keychain is opt-in (`BRAINLOG_USE_KEYCHAIN=1`) and writes are verified by read-back.
- Pulse: previous/next week arrows; peak hours and summary times in local time.

## 1.0.6 — 2026-09-14

- The desktop app opens the full Brainlogs UI in a normal resizable window with a Dock icon; the tray stays for pause/resume and quit. The compact widget is gone from the launch path.
- Brainlogs icon replaces the inherited "SB" tile.
- Ingest skips spool records already older than the retention window, so importing browser history no longer floods memory with months-old visits that would be purged that night.

## 1.0.5 — 2026-09-13

- The desktop app is self-contained: a Node 22 sidecar, the bundled worker, migrations and native modules ship inside the bundle. No Node, Rust or source checkout needed on the user's machine.
- macOS builds are ad-hoc signed for direct download (System Settings → Open Anyway on first launch); `install.sh` installs from the terminal with no dialog.
- Embeddings fall back to deterministic hashing when no model is available; the legacy enrich pipeline degrades with a warning.

## 1.0.1 — 2026-09-12

- Product renamed to **Brainlogs** (bundle, wordmark, docs). Package scopes, the `brainlog` CLI and MCP tool names are unchanged.
- Release pipeline: builders upload artifacts; a single publish job creates the draft release with checksums. Unsigned macOS builds no longer fail the build.

## 1.0.0 — 2026-09-12

First release of Brainlogs, built on the MIT-licensed second-brain capture engine.

- **Capture.** Text-only capture on macOS (Accessibility), Windows (in-memory OCR) and Linux (AT-SPI); policy gate before disk (blocked apps/domains, credentials dropped, sensitivity tags); region dedup, line diffs for terminals and editors, once-per-URL browser sampling, message-level chat dedup.
- **Storage.** SQLite with FTS5 and sqlite-vec (int8, 384 dims), Drizzle migrations, idempotent retention purge that cascades and keeps provenance markers, AES-256-GCM secrets with the key in the OS keychain.
- **Memory.** Search fuses BM25 and vectors with reciprocal rank fusion and entity boosts; `moment()` rebuilds what was on screen and what happened next; `ask` answers with citations from a local model or falls back to extracts.
- **Graph.** People, projects, repos, branches, docs and commitments extracted deterministically with an optional local-model tier; commitments auto-close on evidence, go stalled after three idle days and overdue past their date; a weekly narrative with sentence-level provenance.
- **App.** Pulse, Memory, Commitments, Agents, Audit log and Data & retention views; keyboard-first with a command palette.
- **Agents.** MCP server over stdio and a local socket with `brainlog.*` tools, per-agent permissions, proposed-only writes and a full audit trail. One-line install for Claude Code, Cursor and Codex.
- **CLI.** `brainlog` with `--json` everywhere.
- **Site.** Landing page and docs.
