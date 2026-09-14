---
layout: ../../layouts/Docs.astro
title: Privacy
description: What Brainlogs does with your data, in plain language, and how to verify each claim yourself.
---

# Privacy

Brainlogs is local-first the way a notebook is: there is no server to trust because there is no server. Every claim below names how you can check it on your own machine.

## Nothing leaves your machine

Every listener binds to `127.0.0.1`. The only network calls are optional and user-enabled: Ollama on localhost, Cloud Ask with your own Claude API key (below), and read-only connectors you turn on yourself.

```bash
lsof -iTCP -sTCP:LISTEN -P | grep -i brainlog   # only 127.0.0.1
```

Verified by `packages/worker/src/listeners.test.ts`.

## Cloud Ask is off, and narrow when on

Ask answers come from the local Ollama model, or from an extractive answer when no model runs. **Cloud Ask** is an
opt-in switch under *Data & retention* that sends the question plus the cited moments to Claude (`claude-opus-5`)
using **your own Claude API key**. The key is stored as a 0600 file in the data directory (or read from
`ANTHROPIC_API_KEY`) and is never shown again in full. Only moments tagged `sensitivity: none` are sent:
credentials never exist, and finance, health and other people's messages (DMs) stay on this device. The answer
card says which tier answered and how many moments were withheld. Every Ask, cloud or local, is one audit row.

```bash
ls -l "$HOME/Library/Application Support/brainlog/anthropic-api-key"   # -rw------- or absent
```

Verified by `packages/query/src/api.test.ts` ("cloud ask is off by default…").

## Text, not pixels

Screenshots are never written to disk. On Windows the OCR bitmap lives in memory only; macOS and Linux read the accessibility tree.

```bash
find "$HOME/Library/Application Support/brainlog" \( -name '*.png' -o -name '*.jpg' \)   # nothing
```

Verified by `packages/capture/src/no-images.test.ts` and a Rust source test in `apps/desktop/src-tauri`.

## Secrets are encrypted

Connector tokens are encrypted with AES-256-GCM. The key lives in `master.key` inside the data directory, readable only by your user account (mode 0600), the same protection as the database it guards. Set `BRAINLOG_USE_KEYCHAIN=1` to move it into the OS keychain (Keychain, DPAPI, Secret Service) instead; this is opt-in because a locked login keychain prompts for a password on every read.

## Credentials are never stored

Text that looks like a credential (private keys, API tokens, `password=`, one-time codes) is dropped before it reaches disk. Financial, health and other people's direct messages are stored with a tag so agents cannot read them without your permission.

## Agents cannot read sensitive text

An agent sees only events tagged `none` unless you grant `readSensitive` under **Agents**. Denied calls return an error and an audit row, never partial data.

## Every read and write is audited

Each query and each proposed write produces exactly one audit entry, by you, by the system or by an agent. Export it from **Audit log** or with `brainlog audit --json`.

## Raw text expires

Raw captured text expires after 30 days by default (change it under **Data & retention**). The purge is idempotent and cascades to search indexes and vectors. The entity graph, commitments and summaries persist; their links to expired events are kept as "expired" markers.

## What Brainlogs never does

- No account. No telemetry. No crash reports unless you send them.
- No cloud model unless you enable **Cloud Ask** yourself, and never for captured chat text.
- No capture from apps or domains you block. Password managers are blocked by default.
