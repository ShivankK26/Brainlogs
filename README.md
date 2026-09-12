# Brainlogs

**It's your second brain.**

Brainlogs runs quietly on your computer, keeps the *text* of what you see (window titles, pages, messages, terminal output) and turns it into a searchable memory with people, projects and commitments. Ask a question in plain language and get back the moment: what was on screen and what you did next. Coding agents can query the same memory over a local MCP socket. Nothing leaves your machine.

Built on the MIT-licensed [second-brain](https://github.com/karanpargal/second-brain). See `NOTICE.md`.

## Status

This repository is being built phase by phase. Honest state:

| Area | State |
|---|---|
| Rust capture engine (macOS AX, Windows OCR-in-memory, Linux AT-SPI) | Inherited from upstream, works |
| SQLite storage, secrets, backups | Inherited from upstream, works |
| Brainlogs data model (`packages/types`), Drizzle migrations with FTS5 + vec0 | Done (Phase 1) |
| Capture dedup/diff/sampling + policy gate | Done (Phase 1) |
| Query layer (BM25 + vectors + RRF, moment), policy gate + audit, `brainlog` CLI | Done (Phase 2) |
| In-app UI (Pulse, Memory, Commitments, Agents, Audit, Data & retention) | Done (Phase 3) |
| Entity graph and commitments (extraction, resolution, auto-close, weekly narrative) | Done (Phase 4) |
| MCP server (stdio + local socket) with proposed writes and per-agent permissions | Done (Phase 5) |
| Landing site + docs (`apps/site`), GitHub Releases workflow (.dmg, .msi, .deb, .AppImage), keychain-backed key, §14 checklist tests | Done (Phase 6) |

Upstream features not yet ported to the Brainlogs model (open loops, morning brief, voice, connectors) still run in `packages/agents` and `packages/worker`. They are experimental in this repository.

## Develop

Requirements: Node 22 (`.nvmrc`), pnpm 11, Rust stable for the desktop app, Ollama on `127.0.0.1:11434` for local models.

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm dev:worker     # core daemon on 127.0.0.1:3000 (serves the built UI too)
pnpm dev:app        # in-app UI with hot reload, proxied to the worker
pnpm --filter @brainlog/app test:e2e   # Playwright against a seeded worker
pnpm dev:desktop    # Tauri shell + capture engine
```

## Site

```bash
pnpm dev:site                          # landing page + docs at http://127.0.0.1:4321
pnpm --filter @brainlog/site build     # static output in apps/site/dist (Lighthouse 100/100/100/100)
```

## Verify the privacy claims yourself

- Listeners: `lsof -iTCP -sTCP:LISTEN -P | grep -i node` shows only `127.0.0.1` (test: `packages/worker/src/listeners.test.ts`).
- No images: `find "$HOME/Library/Application Support/brainlog" -name '*.png' -o -name '*.jpg'` returns nothing (tests: `packages/capture/src/no-images.test.ts`, `apps/desktop/src-tauri/src/no_images_test.rs`).
- Master key: `security find-generic-password -s io.brainlog.desktop` on macOS shows the keychain item; no `master.key` content on disk.
- Audit: `pnpm brainlog audit --limit 20` lists every read and write, including denials.
- Data directory: see `docs/decisions/0004-env-prefix-and-data-dirs.md`.

Full statement: `docs/privacy.md`. Architecture: `docs/architecture.md`. Decisions: `docs/decisions/`.

## License

MIT. See `LICENSE` and `NOTICE.md`.

## Agents over MCP

```bash
claude mcp add --scope user brainlog -- npx -y @brainlog/mcp --agent claude-code
pnpm brainlog mcp install cursor    # or codex
```

Tools, permissions and the approval flow are described in `docs/mcp.md`.

## CLI

```bash
pnpm brainlog status
pnpm brainlog search "pricing table" --app Slack
pnpm brainlog moment <eventId>
pnpm brainlog ask "why did I stop on feat/graph-edges?"
pnpm brainlog commitments --status overdue
pnpm brainlog policy block-domain mail.google.com
pnpm brainlog audit --limit 20
pnpm brainlog export --format csv > events.csv
```

Add `--json` to any command for machine-readable output. The CLI uses the running worker (port in `~/.brainlog/port`) and falls back to reading the database directly when the worker is down.
