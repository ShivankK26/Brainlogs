# 0012 — A self-signed signing identity so macOS permissions survive updates

Date: 2026-09-14 · Status: accepted

## Context

Brainlogs reads window text through the macOS Accessibility API. macOS records that grant against the app's
**designated requirement**, the code-signing rule that says "this is the same program". For an ad-hoc signed
app (`signingIdentity: "-"`, ADR 0011) that rule is the hash of the specific binary, so every release produced
a different program in TCC's eyes: after updating from 1.0.9 to 1.0.10 the grant silently stopped applying,
the engine kept running, and capture went blind (empty `window` records, no text) with nothing in the UI to
say so.

The user has ruled out the Apple Developer Program and the App Store (direct download only), so a Developer ID
certificate, the usual fix, is unavailable.

## Decision

1. **Sign releases with a self-signed code-signing certificate** (`CN=Brainlogs Release Signing`, RSA-2048,
   `extendedKeyUsage=codeSigning`, valid to 2036). With a certificate in the chain, codesign writes the
   designated requirement as `identifier "io.brainlog.desktop" and certificate leaf = H"<cert hash>"`, which is
   identical for every build signed with the same certificate. Accessibility (and any other TCC grant) is then
   asked for **once**, at the first install of a build signed this way, and survives updates.
2. The certificate travels as the same three repository secrets the workflow already understood for an Apple
   certificate: `APPLE_CERTIFICATE` (base64 `.p12`), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`.
   Because codesign refuses untrusted identities, the release job also trusts the leaf on the throwaway runner
   (`security add-trusted-cert -d -r trustRoot`). Nothing else in the pipeline changes.
3. The private key lives in the maintainer's `~/.brainlogs-signing/` (mode 0600) and in GitHub's encrypted
   secrets. It is not in the repository. Losing it means one more Accessibility prompt for users, not a
   security incident: the certificate proves continuity, not identity.
4. **Capture health is now visible.** The engine writes `capture-status.json` (Accessibility state, last
   readable text, heartbeat) every 5 s; `/api/v1/status` exposes it; the UI shows a red banner with an "Open
   Accessibility settings" button when text cannot be read, and a distinct message when the engine is not
   running. The sidebar foot says "Capture blind" instead of "Capture active".

## Consequences

- Gatekeeper behaviour is unchanged: a self-signed certificate is no more trusted than ad-hoc, so the first
  launch of a downloaded `.dmg` still needs "Open Anyway" (or `install.sh`, which sets no quarantine flag).
- Users upgrading from an ad-hoc build (≤ 1.0.10) re-grant Accessibility one final time. Subsequent updates
  keep the grant.
- A local `pnpm tauri build` without the secrets still ad-hoc signs (`signingIdentity: "-"` stays in
  `tauri.conf.json`; the env var wins in CI). Local builds therefore do not share the grant with releases.
- If Apple credentials ever appear, the same secrets carry a Developer ID certificate and notarization turns on
  without further changes (ADR 0011).
