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
