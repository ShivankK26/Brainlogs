# Privacy

This document is the plain-language statement of what Brainlog does with your data. It is kept in sync with the security checklist in the build brief and with the claims on the landing page. Each claim names how you can verify it yourself.

> Status: Phase 0. Claims below describe the intended v1 behaviour. Items marked *(verify in Phase N)* are not yet backed by a test in this repository.

- **Nothing leaves your machine.** Every listener binds to `127.0.0.1`. *(verify in Phase 6: a test scans bound sockets.)*
- **No screenshots on disk.** The capture engine keeps OCR bitmaps in memory only. *(verify in Phase 6: an integration test watches the data directory.)*
- **Secrets are encrypted** with AES-256-GCM. The key is stored in the OS keychain.
- **Credentials are never stored.** Text tagged `credential` by the classifier is dropped before it reaches disk. *(verified: `packages/capture/src/ingest.test.ts`)*
- **Agents cannot read sensitive text** unless you grant `readSensitive` per agent. *(verified: `packages/query/src/api.test.ts`)*
- **Agent writes are proposed, never applied.** `brainlog.remember` stores a note with status `proposed`; only you can approve it, in the app or with `brainlog approve`. *(verified: `packages/mcp/src/server.test.ts`)*
- **Every read and write is audited.** Each `query` and `propose` call produces exactly one audit entry, denied calls included. Export with `brainlog audit --json` or from the Audit log view. *(verified: `packages/policy/src/gate.test.ts`, `packages/query/src/api.test.ts`)*
- **Raw text expires.** Default 30 days. The purge is idempotent and cascades to chunks and vectors. The entity graph and summaries persist. *(verified: `packages/core/src/repo/events.test.ts`)*
