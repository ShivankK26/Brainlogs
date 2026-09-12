# 0004 — Data directories and environment variables

**Status:** accepted · **Date:** 2026-09-12

## Decision

Data lives in the platform app-data directory named `brainlog`:

| Platform | Directory |
|---|---|
| macOS | `~/Library/Application Support/brainlog` |
| Windows | `%LOCALAPPDATA%\brainlog` |
| Linux | `~/.local/share/brainlog` |

Small runtime handshake files (`port`, `mcp.sock`) live in `~/.brainlog/` on every platform so the CLI and MCP clients have one predictable path. Windows uses a named pipe `\\.\pipe\brainlog-mcp` instead of a socket file.

Environment variables keep upstream's `BRAIN_` prefix (`BRAIN_DATA_DIR`, `BRAIN_MASTER_KEY`) for now; renaming them buys nothing for users and would silently break existing `.env` files during the transition. Revisit before `v1.0.0`.
