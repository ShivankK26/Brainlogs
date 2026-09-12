# Brainlog over MCP

Coding agents connect to the same memory you use in the app. Every tool call runs as the agent's own identity, is gated by the policy you set in **Agents**, and lands in the audit log. Writes are held as *proposed* until you approve them.

## Install

Claude Code:

```bash
claude mcp add --scope user brainlog -- npx -y @brainlog/mcp --agent claude-code
```

Cursor (writes `~/.cursor/mcp.json`):

```bash
brainlog mcp install cursor
```

Codex (writes `~/.codex/config.toml`):

```bash
brainlog mcp install codex
```

Any other MCP client: run `npx -y @brainlog/mcp --agent <your-id>` over stdio, or connect to the local socket `~/.brainlog/mcp.sock` (`\\.\pipe\brainlog-mcp` on Windows) that the Brainlog worker opens. The socket speaks newline-delimited JSON-RPC, the same framing as stdio, and derives the agent id from `clientInfo.name` when no `--agent` is given.

## Tools

Names are stable. If your client only accepts `[A-Za-z0-9_-]` in tool names, start the server with `BRAINLOG_MCP_TOOL_STYLE=underscore` and use `brainlog_search` etc.

| Tool | Needs | What it does |
|---|---|---|
| `brainlog.search` | readTimeline | Ranked events for a query (BM25 + vectors), with highlights and linked entities. Filters: app, domain, person, repo, from, to. |
| `brainlog.moment` | readTimeline | The focus event, everything else on screen around it, and what happened before and after. |
| `brainlog.timeline` | readTimeline | Events between two timestamps, oldest first. |
| `brainlog.entity` | readGraph | A person, project, repo, branch, topic, org or doc with edges, recent events and commitments. |
| `brainlog.commitments` | readGraph | Promises and requests with lifecycle status. |
| `brainlog.summary` | readGraph | Day or week narrative with sentence provenance. |
| `brainlog.ask` | readTimeline, readGraph | A cited answer from the local model, or the closest moments when none runs. |
| `brainlog.remember` | write | Saves a note, decision or failed attempt as **proposed**. Returns the id and "Saved as proposed — approve in Brainlog to keep it." |
| `brainlog.whoami` | — | The agent id, its permissions and the retention window. |

## Permissions

Defaults for a new agent: `readTimeline`, `readGraph`, `write` on; `readSensitive` off. Sensitive events (credentials are never stored; financial, health and other people's direct messages are tagged) are invisible to an agent unless you switch `readSensitive` on in **Agents**. A denied call returns an MCP tool error and an audit row with result `denied`; no partial data is returned.

## Approving writes

Proposed notes and edges appear in **Agents → Proposed writes** and in **Commitments → Review proposed**. Approve or reject each one. Approved decisions with a repo become part of that repo's memory; rejected writes are kept for the audit trail only.
