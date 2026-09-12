# 0010 — MCP: identity from the connection, dotted tool names with an underscore switch

**Status:** accepted · **Date:** 2026-09-12

## Decisions

- **Agent identity is bound to the connection.** The stdio server takes `--agent <id>`; the install commands always pass it, so audit rows read `claude-code`, `cursor`, `codex`. Without a flag the id is derived from the MCP `initialize` `clientInfo.name` (mapped to the known ids, otherwise slugified). The identity can never be changed by a later tool call.
- **One query API per session, created lazily** so the id from `initialize` is available. The MCP layer contains no permission logic; `@brainlog/policy` gates inside `@brainlog/query`, so the MCP server cannot bypass it even by mistake.
- **Tool names are the spec's dotted names.** The MCP SDK's SEP validation allows dots. Clients whose tool grammar is `[A-Za-z0-9_-]` can start the server with `BRAINLOG_MCP_TOOL_STYLE=underscore`; the mapping is mechanical (`brainlog.search` → `brainlog_search`) and documented in `docs/mcp.md`.
- **Socket transport** is newline-delimited JSON-RPC over `~/.brainlog/mcp.sock` (mode 0600) or a named pipe, one MCP session per connection, started by the worker. It reuses the SDK's stdio framing helpers so the two transports cannot drift.
- **Denials are tool errors, not protocol errors.** The agent sees "Denied by policy: …" as `isError`, which lets it explain the situation to the user instead of crashing the session.
