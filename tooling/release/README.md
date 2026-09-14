# Release tooling

## What ships

`git tag v1.2.3 && git push --tags` runs `.github/workflows/release.yml`, which builds the desktop app on macOS (universal `.dmg`), Windows (`.msi`) and Ubuntu (`.deb`, `.AppImage`) with `tauri-apps/tauri-action`, attaches them to a GitHub Release, and publishes `@brainlog/cli` and `@brainlog/mcp` to npm through Changesets.

## Signing

| Platform | Local build | Release |
|---|---|---|
| macOS | `sign-macos.mjs` ad-hoc signs the `.app` so Gatekeeper launches it | Releases sign with the self-signed `Brainlogs Release Signing` identity (ADR 0012) so macOS keeps the Accessibility grant across updates; with a Developer ID in the same secrets, `notarize-macos.mjs` notarizes the `.dmg` with `notarytool` and staples |
| Windows | unsigned | `TAURI_SIGNING_*` for the Tauri updater; Authenticode via `signtool` once a certificate exists |
| Linux | unsigned | unsigned (`.deb`/`.AppImage` checksums are on the release) |

Secrets read by the workflow: `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`, `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `NPM_TOKEN`. All optional: the workflow degrades to ad-hoc signed artifacts with a warning.

Rotating the self-signed identity (only if the key is lost; users re-grant Accessibility once):

```bash
openssl req -new -newkey rsa:2048 -nodes -keyout key.pem -out req.csr -subj "/CN=Brainlogs Release Signing/O=Brainlogs"
printf 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=critical,codeSigning\nsubjectKeyIdentifier=hash\n' > ext.cnf
openssl x509 -req -days 3650 -sha256 -in req.csr -signkey key.pem -out cert.pem -extfile ext.cnf
openssl pkcs12 -export -legacy -inkey key.pem -in cert.pem -out signing.p12 -passout pass:"$PW" -name "Brainlogs Release Signing"
base64 -i signing.p12 | tr -d '\n' | gh secret set APPLE_CERTIFICATE
printf '%s' "$PW" | gh secret set APPLE_CERTIFICATE_PASSWORD
printf 'Brainlogs Release Signing' | gh secret set APPLE_SIGNING_IDENTITY
```

## Updater

The Tauri updater needs a signing key pair (`pnpm --filter @brainlog/desktop tauri signer generate`) and an `endpoints` entry in `tauri.conf.json` pointing at the GitHub Release `latest.json`. That wiring is intentionally left for the first signed release (ADR 0011): shipping an updater that checks an endpoint we do not yet publish would be a network call the privacy page does not describe.

## Versions

Desktop, CLI and MCP share the tag version. `pnpm changeset` records CLI/MCP changes; `pnpm release:version` bumps them.
