# 0011 — v1.0.0 release shape and deliberate deviations from the brief

**Status:** accepted · **Date:** 2026-09-12

## Release

- Tags `v*` build the desktop app for macOS (universal), Windows and Ubuntu with `tauri-action` and attach `.dmg`, `.msi`, `.deb` and `.AppImage` to a draft GitHub Release. Apple signing and notarization run when the secrets exist; otherwise artifacts are ad-hoc signed and the workflow warns. `@brainlog/cli` and `@brainlog/mcp` publish to npm via Changesets when `NPM_TOKEN` is set.
- The Tauri updater is documented but not wired (see `tooling/release/README.md`): enabling it means a periodic network call to a release endpoint, which the privacy page would have to disclose first.

## Deviations, each with a reason

- **Worker port is fixed at 3000 by default, not random.** The Rust shell hardcodes the port and cannot be compile-checked in this environment; the port file in `~/.brainlog/port` is written anyway so the CLI and a future shell change already discover it. Localhost binding plus the per-install token is what protects the API; a random port adds no security. Tracked for 1.1.
- **`blocked_by` and `decided` edges** have no deterministic source yet (ADR 0009).
- **Lighthouse ≥ 95** was measured locally against the static build (see the Phase 6 commit message); it is not enforced in CI because Lighthouse needs Chrome on the runner.
- **Upstream open-loops, briefs, voice and connectors** still run on the legacy tables (ADR 0003). They are marked experimental in the README and are not surfaced in the new UI.
- **Landing page `--t3` is `#8B8E96`, not the mock's `#72747C`.** The mock's tertiary grey fails WCAG AA (≈3.9:1) on the section backgrounds, which cost Lighthouse accessibility points. The in-app token is unchanged.

## Addendum (v1.0.2) — self-contained installers without an Apple Developer account

- The desktop bundle now ships a Node 22 runtime as a Tauri sidecar (`brainlogs-node`), the worker bundled by esbuild as one ESM file, the SQL migrations, and only the native dependencies (better-sqlite3, sqlite-vec) as resources. `tooling/release/prepare-bundle.mjs` stages them; on macOS both architectures are fetched and merged with `lipo` so the universal `.app` works on Intel and Apple silicon. The shell (`core.rs::bundled_core`) prefers this path and falls back to the dev checkout only when it is absent.
- `@xenova/transformers`, `sharp` and `onnxruntime-node` are not shipped (they would add ~200 MB per platform). Embeddings use Ollama when present and deterministic hashing otherwise; the legacy enrich pipeline degrades with a warning.
- macOS builds are **ad-hoc signed** (`signingIdentity: "-"`), which is what makes "Open Anyway" possible instead of "damaged". Distribution is direct download only; `install.sh` fetches with `curl`, which sets no quarantine attribute, so users who prefer the terminal see no dialog at all.
- **Hardened runtime is off for unsigned builds.** With `--options runtime` the ad-hoc-signed Node sidecar is killed on launch (SIGTRAP: no JIT entitlement). The hardened runtime only matters for notarization, which needs an Apple Developer account we do not use. `Entitlements.plist` (allow-jit, unsigned executable memory, disable library validation) is kept so a future Developer ID build can turn the runtime back on; both configurations were verified by re-signing the 1.0.4 bundle.
