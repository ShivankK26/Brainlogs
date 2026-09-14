# Changelog

## 1.0.13 — 2026-09-15

- **Brainlogs updates itself.** The sidebar shows "Update to x.y.z · restart" when a newer release exists; one click downloads the signed archive, verifies it, replaces the app in place and relaunches (ADR 0013). No more deleting and re-dragging. Update checks need the release to be reachable, so they start working once the repository is public.
- **A new install replaces an old running core.** The shell now compares the core's bundle version with its own and recycles a stale core instead of reusing it, so the UI and API can no longer be different versions after an update.
- **Real filters in Memory.** The Filter button opens a panel: text, app, domain, person, repo or branch, and a date range, with apps and domains suggested from the last 30 days. ⌘K remains the fast search.
- The no-model Ask answer shows local times, no longer repeats the title, and answers "when …" questions with the time of the newest match.

## 1.0.12 — 2026-09-14

- Memory showed 10 September instead of today: the 7-day timeline was capped at 2000 events *after* sorting oldest-first, so a busy week hid its newest days. The cap now keeps the newest events. The count pill says "newest 2000 events" when the cap applies.

## 1.0.11 — 2026-09-14

- **Capture no longer goes blind after an update.** Releases are signed with a stable self-signed identity, so the macOS Accessibility grant survives upgrades (ADR 0012). Upgrading from 1.0.10 or earlier asks for Accessibility one last time.
- The app now says when it cannot see: a banner with an "Open Accessibility settings" button when window text is unreadable, a different one when the engine is not running, and "Capture blind" in the sidebar. The engine reports its health in `capture-status.json`; `/api/v1/status` exposes it.
- **Ask from the palette.** Type a question in ⌘K and press Enter: Memory shows an answer card with clickable `[n]` citations that select the cited moment. Questions rank the Ask action first; plain terms keep the filter first.
- **Cloud Ask (opt-in) with your own Claude API key.** Data & retention gains a key field; when on, answers come from Claude (`claude-opus-5`). Only moments with no sensitivity tag are sent, and the card reports how many were withheld. Local Ollama remains the default; the no-model fallback now explains both options.
- Search stops using the hashing fallback as a vector leg: without a real embedding model it only re-measured word overlap with worse precision than BM25, which is why questions returned unrelated YouTube history. Lexical ranking is used until a model is available.
- Browser history import starts at the retention horizon instead of re-importing the whole history (tens of thousands of visits) on every launch.

## 1.0.10 — 2026-09-14

- The shell reclaims port 3000 from a hung or orphaned core before starting a new one, instead of spinning on "Starting Brainlogs…". The core logs a clear message when the port is taken.

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
