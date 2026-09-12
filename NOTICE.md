# Notice

Brainlog is built on top of **second-brain** by Karan Pargal and contributors,
released under the MIT License.

- Upstream: https://github.com/karanpargal/second-brain
- Vendored at: the `main` branch as of 12 September 2026 (see the first commit in this repository)

The following parts of this repository are derived from upstream and keep its license and copyright:

- `apps/desktop` — Tauri shell and Rust capture engine (Windows OCR-in-memory, macOS Accessibility, Linux AT-SPI)
- `packages/core` — config, secrets, SQLite/Drizzle schema, jobs, backups
- `packages/capture`, `packages/enrich`, `packages/agents`, `packages/worker`, `packages/mcp`, `packages/connectors`, `packages/evals`
- `apps/app` — originally `apps/web`
- `scripts/`, `packaging/`, `flake.nix`

Brainlog-specific additions (`packages/types`, `packages/ui`, `packages/graph`, `packages/query`, `packages/policy`, `packages/cli`, `apps/site`, `tooling/`, `docs/`) are © 2026 Brainlog contributors, also MIT.

The full license text is in `LICENSE`.
