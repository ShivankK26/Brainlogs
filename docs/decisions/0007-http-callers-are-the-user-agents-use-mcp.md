# 0007 — HTTP callers are the user; agents only reach memory over MCP

**Status:** accepted · **Date:** 2026-09-12

## Context

The worker exposes `/api/v1/*` for the in-app UI and the CLI. Agents (Claude Code, Cursor, Codex) also need memory access, and every call must be gated and audited per actor.

## Decision

- `/api/v1` always runs the query API as actor `user`. It is protected by the per-install API token in the data directory, which only local processes running as the user can read.
- Agents never talk HTTP. The MCP server (Phase 5) runs the query API in-process as actor `<agentId>`, so permissions and audit rows carry the agent's identity and cannot be spoofed with a header.
- The CLI reads the worker port from `~/.brainlog/port`. When the worker is not running, read commands fall back to the in-process query API against the same SQLite file (WAL mode allows the concurrent readers), and job commands run in-process.

## Consequences

- One audit model: `user` from the UI/CLI, `system` from scheduled jobs, `<agentId>` from MCP.
- The worker keeps the fixed default port (3000) until the Rust shell learns to read the port file (Phase 6). The file is written today so the CLI already discovers it.
