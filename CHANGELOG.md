# Changelog

## 1.3.3 — 2026-09-20

- The strip no longer recalls Brainlogs at itself. Its own windows, and the app's, are skipped: everything it would say is already on the screen behind it.


## 1.3.2 — 2026-09-20

- **The strip stays awake.** It spoke once after 1.3.1 and then went quiet: macOS suspends a hidden window's clock, so a strip that hides itself never ticks again. It now parks as one transparent pixel that ignores the mouse instead of hiding, and the desktop shell nudges it whenever the front window changes, so it no longer depends on its own clock alone.


## 1.3.1 — 2026-09-20

- **The recall strip actually appears.** Its three calls — which window is in front, show, hide — were missing from the desktop app's IPC allow-list, so every poll since 1.2.0 was denied and the strip could never say anything. It now works on the machine as it always did in the tests.
- Whether the strip is polling is written into the engine status, so a silent strip is visible instead of merely absent.
- The strip stays on screen long enough to be read: the eight-second timer scales with the number of lines, and hovering it stops the clock until the pointer leaves.
- The rule that keeps the strip off a screen somebody else can see now lives in one place with tests behind it.
- The installer checks that the app it just copied is actually there, retries once, and fails loudly instead of reporting success over an empty folder.
- Releases publish themselves again. Every release since the updater landed was left as a draft, which serves no downloads and hides the update manifest, so both the installer and in-app updates were quietly broken.


## 1.3.0 — 2026-09-20

- **The strip knows who you are talking to.** Open a chat and it shows how many conversations you have had, when the last one was, and every open promise in either direction with its due date. It quotes none of the conversation: those words are already on the screen, and a floating window is the wrong place to repeat them.
- **Calls get the same card** for everyone the roster on screen names, so you walk in knowing what is owed with the people in the room.
- **Silence rules.** The strip stays hidden whenever the screen may not be private: a window filling its display, or a title announcing that you are sharing or presenting. Nothing appears over a shared screen.
- The recall endpoint now reads commitments as well as the timeline, so it is gated on both permissions and audited as before (ADR 0015).


## 1.2.1 — 2026-09-20

- The same document is now one place whether you open it in its own app or in a browser tab. A Notion or Linear page read in Chrome no longer counts as a stranger.
- "What changed" stays quiet where change means nothing. Terminals, chats and calls scroll by design, so they are no longer diffed, and a page that moved by more than a dozen lines is described as substantially rewritten instead of quoting one line at random.
- A change sentence is never printed when the before and after read identically once shortened.

## 1.2.0 — 2026-09-20

- **The recall strip.** A small window that follows whatever app you're in and tells you what Brainlogs already knows about it: how many times you've been here, what changed since your last visit, and the decisions or open questions on the record. It never takes focus, hides itself after eight seconds, and stays silent on a page it has nothing to say about. Escape dismisses it for that place (ADR 0015).

## 1.1.0 — 2026-09-20

- **Places.** Brainlogs now recognises the things you return to — documents, people, repositories, sites — and groups everything it knows around them instead of around the clock. A new Places screen lists them with visit counts and a seven-day sparkline; opening one shows every visit.
- **What changed since you were last here.** Because capture is text and not screenshots, two visits to the same page can be compared directly. A visit that differs from the one before shows a plain sentence: “*Enterprise $499/mo* became *Enterprise contact us*”. No model, no network (ADR 0014).
- Decisions, open questions and promises found in a place's text are listed beside its history.
- New read-only endpoints `/api/v1/recall`, `/api/v1/places` and `/api/v1/places/:key`, gated and audited like every other read.

## 1.0.24 — 2026-09-16

- Sidebar: the repositories and branches group is titled "Top screens" (the separate app list added in 1.0.23 is removed).

## 1.0.23 — 2026-09-16

- **Overview:** "Focused time" is now "Active time" and counts wall-clock time once even when several windows overlap (it previously summed sessions, so a day could read 20 h). "Daily rhythm" is "Time per day". The People & places panel is now "Top sites" only. Week-over-week change for app switches is hidden when last week had too little data to compare.
- **Commitments:** the count strip filters the list (all, overdue, you owe, owed to you, done, dismissed).
- **Sidebar:** "Projects" replaced by "Top screens" (your most-captured apps this week, each a filter); People kept; the footer is a compact model / memory / retention readout. The Agents page is gone: agents still connect over MCP and their proposed writes are reviewed from Commitments and the Audit log.
- **Data & retention** rebuilt as grouped settings (Retention, Capture rules, Security, Models) with consistent rows.
- Memory detail: the Copy id button is now a primary button.

## 1.0.22 — 2026-09-16

- Commitments: donation appeals and job-seeking blurbs, résumé fields like "CGPA:", and inbox previews hidden behind invisible text-direction characters are no longer recorded; existing ones are dismissed.

## 1.0.21 — 2026-09-15

- The workspace button in the sidebar is now an app menu: version, Check for updates, Pause/Resume capture, Data & retention, Audit log, Quit. It used to be a decorative chevron.
- Group broadcasts ("please share this message…", blood-donor appeals) and group names used as speakers ("Batch") no longer become commitments; existing ones are dismissed.
- The status endpoint reports the real app version instead of 0.1.0.

## 1.0.20 — 2026-09-15

- Commitments shows a collapsed "Dismissed" section so items removed by the cleanup are visible and can be reopened; the empty state says how many were dismissed and why.

## 1.0.19 — 2026-09-15

- **Commitments, rebuilt for action.** Four buckets (Overdue, You owe, Owed to you, Done recently) with a count strip, each row showing who, when it was made, when it's due, and its sources; Done, Dismiss and Reopen buttons on every row. Honest empty state.
- Ask understands third-person contact questions (“has Sarvagya connected me to Wavelength team?”, “did Priya reply?”): it finds the conversation with that person, checks whether the topic came up, and answers Yes / Not yet with the quote; unrelated pages that merely share a word no longer appear.
- **Fewer false commitments.** Inbox previews and notification text (“Your message, …”, “… Received from …”) are ignored, a request needs an action verb, and a commitment with no named counterpart is not recorded (a channel stands in for group asks). Already-stored junk is dismissed automatically by the graph job.

## 1.0.18 — 2026-09-15

- People are extracted from chats only when a name repeats as a speaker, has two words, or is the conversation partner; a one-off "Role: …" or "Location: …" line is a form field, not a person. Existing mis-labelled people are reclassified as topics by the graph job, so Conversations and the People group clean themselves up on the next run.

## 1.0.17 — 2026-09-15

- Overview "Conversations" and the sidebar People group no longer list interface words ("username", "Register", "Batch", "CTC") that the extractor mistook for people; only plausible names are shown.

## 1.0.16 — 2026-09-15

- **Pulse is now Overview**, rebuilt around measures instead of prose: focused time with a week-over-week delta, share of time on the top project, app switches (with trend) and open commitments; where the time went (projects and apps, browsers merged); a daily rhythm chart you can click into; highlights computed from the data (most focused day, longest stretch, who you talked to) with evidence a click away; conversations and top sites. The generated narrative is still there behind "Show weekly narrative".
- **Ask answers read like an answer.** One verdict line, the quoted evidence if there is one, a single line of context, then a short list of sources with "Show more". The model prompt is a small link. Text is quoted only when it adds something beyond the window title.
- Sidebar entities are grouped into People and Projects, with repository names shortened and full names on hover.

## 1.0.15 — 2026-09-15

- **Ask understands who and what.** "Did I send Sarvagya a message asking about base pay?" now separates the person (Sarvagya) from the topic (base pay), searches for the person, checks whether the topic appears in the captured chat text, and answers "Yes. You messaged Sarvagya on WhatsApp about base pay, Tue 15 Sept 1:57–2:02 pm" with the matching line quoted. If the chat exists but never mentions the topic, it says so instead of guessing.
- Only moments that actually mention the person are listed; pages that merely shared a word ("Payments Engineer" for "pay") are dropped. Browser-history rows and window captures of the same page merge into one moment.
- The "free local model" prompt under an answer is now a single line that expands on request.

## 1.0.14 — 2026-09-15

- **Ask answers the question, without a paid model.** Questions are planned into an intent (did I…, when…, how long…, what did I do…, who is…), a subject and a time scope ("yesterday", "last week", "on Monday", "in August"). Repeated captures of the same window collapse into one moment with a time range. The card leads with a verdict ("Yes. You were in a conversation involving Rohit Talluri in LinkedIn messages, Tue 15 Sept 12:57–12:59" or "No conversation captured; you did open their profile at 12:55"), then facts, then the moments, each one clickable.
- **Free written answers in two clicks.** The card and Data & retention now walk you through Ollama: download, start, and pull a small model (qwen2.5:3b, 1.9 GB) with a progress bar. Ask picks the best installed model automatically.
- Ask no longer searches with the whole question; it searches for the subject inside the time scope, and says when it had to widen the scope.

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
