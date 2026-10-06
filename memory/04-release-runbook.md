# Shipping a version

About forty minutes end to end, most of it the Windows and Linux Rust builds.

## 1. Bump the version everywhere

Eight places, and missing one produces a confusing half-upgrade:

- `package.json` (root)
- `apps/app/package.json`
- `apps/desktop/package.json`
- `packages/cli/package.json`
- `packages/mcp/package.json`
- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/Cargo.toml`
- `apps/desktop/src-tauri/Cargo.lock` (the `brainlog-desktop` entry)

Then write a `CHANGELOG.md` entry in plain language: what changed for a person
using it, not what changed in the code.

## 2. Verify locally, as far as you can

`pnpm -w typecheck && pnpm -w lint && pnpm -w test`.

**Cargo is not installed on this machine.** Rust cannot be compiled locally and
a `cargo check` that appears to pass is lying to you (this happened: the error
was "command not found" hidden inside a grep). Rust is only ever verified by CI.

## 3. Push to main first and let CI pass

Pushing cancels any in-progress run for the branch, so do not push again while
waiting. CI's `rust` job is path-gated on `apps/desktop/src-tauri/**` and runs
on Linux, so it never compiles `capture_mac.rs`. **macOS Rust is only compiled
by the release's desktop matrix**, which is twenty minutes in. Accept that, or
accept a failed release.

## 4. Tag and let the release run

`git tag vX.Y.Z && git push origin vX.Y.Z`. The workflow runs verify, plan, the
three desktop builds, then publish. The publish job uploads the artifacts,
writes `latest.json` for the updater, and marks the release published and
latest. It used to leave drafts, which broke both downloads and updates; see
`05-bugs-and-root-causes.md`.

## 5. Install it

```
BRAINLOGS_VERSION=vX.Y.Z sh tooling/release/install.sh
```

The script verifies the copy and retries once, because a copy has reported
success and then not been there.

## 6. Check it actually works

```
defaults read /Applications/Brainlogs.app/Contents/Info.plist CFBundleShortVersionString
cat "$HOME/Library/Application Support/brainlog/capture-status.json"
```

`recall_poll_age_s` should be a small number and stay small. `null` or a
climbing number means the strip is not polling and the release is broken even
if it installed cleanly. The audit table also records every recall query:

```
sqlite3 "$HOME/Library/Application Support/brainlog/brain.db" \
  "select ts, scope from audit_entries where scope like 'recall%' order by ts desc limit 5;"
```

## Signing and secrets

Self-signed identity `Brainlogs Release Signing`, private key and p12 in
`~/.brainlogs-signing/` (0600) and in the repo secrets `APPLE_CERTIFICATE`,
`APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`. The workflow trusts the
leaf on the runner with `security add-trusted-cert`. Updater signing uses a
minisign key in the same folder and the secrets `TAURI_SIGNING_PRIVATE_KEY` and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

Two traps already paid for: OpenSSL 3 cannot read the legacy p12, so the
workflow uses `security find-certificate -a -p` rather than `openssl pkcs12`;
and the throwaway keychain must be unlocked with
`security set-keychain-settings -lut 21600` or codesign waits on a prompt for
seventy-seven minutes before the job times out.
