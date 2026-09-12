---
layout: ../../layouts/Docs.astro
title: CLI
description: "The brainlog command: status, search, moments, commitments, policy and exports from the terminal."
---

# CLI

```bash
npm i -g @brainlog/cli
brainlog help
```

The CLI talks to the running worker (port in `~/.brainlog/port`). When the worker is not running, read commands open the database directly.

| Command | What it does |
|---|---|
| `brainlog status` | Worker, capture and memory counts |
| `brainlog capture pause [--minutes 60]` / `resume` | Pause or resume capture |
| `brainlog ingest` / `enrich` / `graph` / `loops` | Run a job now |
| `brainlog search "<q>" [--app X] [--domain X] [--person X] [--repo X] [--from ISO] [--to ISO]` | Search memory |
| `brainlog moment <eventId> [--window 15m]` | Rebuild a moment |
| `brainlog timeline [--from ISO] [--to ISO]` | Events in a range |
| `brainlog commitments [--status open] [--party X]` | Promises and requests |
| `brainlog summary [--week \| --day] [--date YYYY-MM-DD]` | Narrative summary |
| `brainlog ask "<question>"` | A cited answer |
| `brainlog remember "<text>" [--kind decision] [--repo X]` | Add a note |
| `brainlog pending` / `approve <id>` / `reject <id>` | Review agent writes |
| `brainlog audit [--limit 50] [--actor X]` | Audit log |
| `brainlog export --format json\|csv [--from ISO] [--to ISO]` | Export events |
| `brainlog purge --older-than 30d` | Purge raw text |
| `brainlog policy show \| block-app <name> \| block-domain <domain> \| retention <days>` | Policy |
| `brainlog mcp install claude-code\|cursor\|codex` | One-line MCP setup |

Add `--json` to any command for machine-readable output.
