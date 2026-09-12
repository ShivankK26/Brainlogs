---
layout: ../../layouts/Docs.astro
title: Privacy
description: What Brainlogs does with your data, in plain language, and how to verify each claim yourself.
---

# Privacy

Brainlogs is local-first the way a notebook is: there is no server to trust because there is no server. Every claim below names how you can check it on your own machine.

## Nothing leaves your machine

Every listener binds to `127.0.0.1`. The only network calls are optional and user-enabled: Ollama on localhost, and read-only connectors you turn on yourself.

```bash
lsof -iTCP -sTCP:LISTEN -P | grep -i brainlog   # only 127.0.0.1
```

Verified by `packages/worker/src/listeners.test.ts`.

## Text, not pixels

Screenshots are never written to disk. On Windows the OCR bitmap lives in memory only; macOS and Linux read the accessibility tree.

```bash
find "$HOME/Library/Application Support/brainlog" \( -name '*.png' -o -name '*.jpg' \)   # nothing
```

Verified by `packages/capture/src/no-images.test.ts` and a Rust source test in `apps/desktop/src-tauri`.

## Secrets are encrypted

Connector tokens are encrypted with AES-256-GCM. The key is kept in the OS keychain (Keychain on macOS, DPAPI on Windows, Secret Service on Linux), with a `0600` file as the fallback when no keychain is available.

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
