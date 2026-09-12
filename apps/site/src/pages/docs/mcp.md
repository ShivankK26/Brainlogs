---
layout: ../../layouts/Docs.astro
title: MCP setup
description: Connect Claude Code, Cursor or Codex to your Brainlog memory in one line.
---

# MCP setup

Coding agents connect to the same memory you use in the app. Every tool call runs as the agent's own identity, is gated by the permissions you set under **Agents**, and lands in the audit log. Writes are held as *proposed* until you approve them.

## Claude Code

```bash
claude mcp add --scope user brainlog -- npx -y @brainlog/mcp --agent claude-code
```

## Cursor

```bash
brainlog mcp install cursor
```

This writes the `brainlog` server into `~/.cursor/mcp.json`. Restart Cursor.

## Codex

```bash
brainlog mcp install codex
```

This appends an `[mcp_servers.brainlog]` block to `~/.codex/config.toml`.

## Any other client

Run `npx -y @brainlog/mcp --agent <your-id>` over stdio, or connect to the local socket the Brainlog worker opens at `~/.brainlog/mcp.sock` (`\\.\pipe\brainlog-mcp` on Windows). The socket speaks newline-delimited JSON-RPC, the same framing as stdio.

## Tools

| Tool | Needs | What it does |
|---|---|---|
| `brainlog.search` | readTimeline | Ranked events for a query, with highlights and linked entities. |
| `brainlog.moment` | readTimeline | The focus event, everything else on screen, and what happened before and after. |
| `brainlog.timeline` | readTimeline | Events between two timestamps. |
| `brainlog.entity` | readGraph | A person, project, repo, branch, topic, org or doc with edges, events and commitments. |
| `brainlog.commitments` | readGraph | Promises and requests with lifecycle status. |
| `brainlog.summary` | readGraph | Day or week narrative with sentence provenance. |
| `brainlog.ask` | readTimeline, readGraph | A cited answer from the local model, or the closest moments. |
| `brainlog.remember` | write | Saves a note, decision or failed attempt as **proposed**. |
| `brainlog.whoami` | — | The agent id, its permissions and the retention window. |

If your client only accepts `[A-Za-z0-9_-]` in tool names, start the server with `BRAINLOG_MCP_TOOL_STYLE=underscore` and use `brainlog_search` and friends.

## Permissions

A new agent gets `readTimeline`, `readGraph` and `write`; `readSensitive` is off. Sensitive events (financial, health, other people's direct messages; credentials are never stored) stay invisible to the agent until you switch it on. A denied call returns a tool error and an audit row, never partial data.
