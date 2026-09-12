# Release tooling

## What ships

`git tag v1.2.3 && git push --tags` runs `.github/workflows/release.yml`, which builds the desktop app on macOS (universal `.dmg`), Windows (`.msi`) and Ubuntu (`.deb`, `.AppImage`) with `tauri-apps/tauri-action`, attaches them to a GitHub Release, and publishes `@brainlog/cli` and `@brainlog/mcp` to npm through Changesets.

## Signing

| Platform | Local build | Release |
|---|---|---|
| macOS | `sign-macos.mjs` ad-hoc signs the `.app` so Gatekeeper launches it and the Accessibility grant sticks | `notarize-macos.mjs` signs with a Developer ID, notarizes the `.dmg` with `notarytool`, staples |
| Windows | unsigned | `TAURI_SIGNING_*` for the Tauri updater; Authenticode via `signtool` once a certificate exists |
| Linux | unsigned | unsigned (`.deb`/`.AppImage` checksums are on the release) |

Secrets read by the workflow: `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`, `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `NPM_TOKEN`. All optional: the workflow degrades to unsigned artifacts with a warning.

## Updater

The Tauri updater needs a signing key pair (`pnpm --filter @brainlog/desktop tauri signer generate`) and an `endpoints` entry in `tauri.conf.json` pointing at the GitHub Release `latest.json`. That wiring is intentionally left for the first signed release (ADR 0011): shipping an updater that checks an endpoint we do not yet publish would be a network call the privacy page does not describe.

## Versions

Desktop, CLI and MCP share the tag version. `pnpm changeset` records CLI/MCP changes; `pnpm release:version` bumps them.
