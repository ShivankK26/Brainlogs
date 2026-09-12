# 0006 — Sensitivity classifier: deterministic tier first, DMs are third-party private

**Status:** accepted · **Date:** 2026-09-12

## Context

§7 asks for a sensitivity classifier ("regex + small local model") whose `credential` verdict drops text before it touches disk. A model call at capture time is slow, non-deterministic and needs Ollama running.

## Decision

`@brainlog/policy` ships a regex tier that runs synchronously on every record:

- `credential`: private key blocks, vendor token formats (OpenAI, GitHub, AWS, Slack, JWT), `key=value` secret assignments, credentialed connection strings, one-time codes. This tier is the only one that drops text, so it stays deterministic and unit-tested.
- `financial`: card numbers, IBANs, balance/statement/routing vocabulary.
- `health`: diagnosis/prescription/lab-result vocabulary and patient-portal names.
- `third_party_private`: any chat capture whose window is a direct message (title contains `DM`, `direct message`, or the app is a DM-first messenger such as WhatsApp, Signal, Telegram, iMessage). Channel captures are `none`.

A local-model tier can later *upgrade* `none` → `financial|health` in a background job; it can never downgrade a tag and never touches `credential`.

## Consequences

- DMs are stored (they are the user's own history) but hidden from agents unless `readSensitive` is granted, which matches the landing-page claim "Agents read what you read, nothing you blocked" and the "others' DMs" row in the privacy table.
- Regex false positives on `credential` lose a capture; that is the safe direction.
