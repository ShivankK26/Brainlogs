# What Brainlogs is

A second brain that fills itself. It watches what is on your screen, keeps the
text, and later tells you what you already knew. Nothing is sent anywhere. There
is no account, no server, no subscription.

The product is a macOS desktop app: a Tauri shell in Rust around a bundled Node
sidecar that runs the core, with SQLite and sqlite-vec on disk. Windows and
Linux builds exist and are produced by the same release, but nobody has tested
them.

## The rules

These came from the owner directly and have shaped nearly every technical call.
Break one and you are building a different product.

1. **No Apple Developer Program, no App Store, direct download only.** This is
   why releases are signed with a self-signed identity rather than notarized,
   why the one-line installer uses curl (a curl download carries no quarantine
   flag, so there is no Gatekeeper dialog), and why a browser download needs a
   right-click then Open the first time. See `docs/decisions/0012`.
2. **No paid model keys. Zero running cost.** Every feature must work with no
   model at all. Ask plans queries and composes answers with deterministic
   string work (`packages/query/src/plan.ts`). Places, visits, change detection
   and the strip use no model either. A local model through Ollama is optional
   and improves phrasing; Cloud Ask exists but needs the user's own key and is
   off by default.
3. **Ship every change, and install it.** The owner expects each change tagged,
   released and installed on their Mac in the same sitting. The loop is in
   `04-release-runbook.md`. This is slow (about forty minutes a version) and it
   is still the right thing: four real bugs this session were only visible on
   the installed build.
4. **Local-first is the claim, so it has to be true.** The API binds to
   127.0.0.1, every read is policy-gated and audited, blocked apps and domains
   are enforced before anything is written, and sensitive events are filtered
   again on the way out.

## Shape of the code

A pnpm + Turborepo monorepo. The parts that matter:

- `packages/core` — database, schema, migrations, encryption, config.
- `packages/capture` — spool ingest, policy enforcement on the way in.
- `packages/query` — search, Ask, planning, places and recall. Most of the
  interesting logic is here and it is all unit tested.
- `packages/graph`, `packages/enrich` — entities, commitments, embeddings.
- `packages/worker` — the HTTP core: `/api/v1/*`, plus `/api/health`.
- `apps/app` — the React UI, served by the core, used by both windows.
- `apps/desktop` — the Tauri shell (Rust) that owns capture, the tray, the
  windows and the updater.
- `apps/site` — the landing page. Built, never deployed.
