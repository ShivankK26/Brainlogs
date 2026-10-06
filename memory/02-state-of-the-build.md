# State of the build, 2026-10-06

Version **1.4.1**, installed and running on the owner's Mac. Repo is
`ShivankK26/Brainlogs`, public. Releases publish themselves and the in-app
updater works.

## What is real and working

- **Capture** on macOS through the Accessibility API, text only, never
  screenshots. Survives app updates because releases are signed with a stable
  self-signed identity, so the TCC grant is not revoked.
- **Ask** with no model: intent, subject and time scope are planned
  deterministically, hits are clustered into moments, and the answer is a
  verdict plus quotes with citations.
- **Overview** with the week's active time (union of overlapping sessions, not
  a sum), time per day, highlights derived from data, and top sites.
- **Commitments** in four buckets with a user-only done/dismissed/reopen action,
  and extraction that rejects inbox previews, broadcasts and acronyms.
- **Places** (1.1.0): everything grouped by the thing you return to rather than
  by the clock, with visit counts, a week sparkline, and per-visit diffs.
- **The recall strip** (1.2.0 through 1.4.1): a transparent always-on-top window
  that says what you already know about the window in front of you. This is the
  feature the owner chose after five rounds of design and it is the centre of
  the product now. See `03-recall.md`.
- **Privacy and governance**: policy gating on every read, an audit log, capture
  rules, retention, and a settings page that states all of it plainly.
- **Updates**: tauri-plugin-updater with minisign signatures and a `latest.json`
  written by the publish job. Works from 1.0.14 onward now the repo is public.

## What exists but is not finished

- **The landing page** (`apps/site`) is built and undeployed. The GitHub links
  were removed at the owner's request and the download buttons are deliberately
  inert. Nothing points a stranger at a download today.
- **npm packages** (`@brainlog/cli`, `@brainlog/mcp`) are gated behind a repo
  variable `PUBLISH_NPM=true` and an `NPM_TOKEN` secret. Neither exists.
- **Windows and Linux** installers are built every release and have never been
  run by anyone.
- **The strip's visuals** have never been seen by me. Screen recording is not
  granted to the shell I work in, so every claim about how it looks is from the
  code and from the owner's screenshots.

## Honest assessment

One user. The feature that makes the product distinctive shipped broken three
times in a row and only started working on 2026-09-20. The thing standing
between this and feedback is not a feature, it is the undeployed site.
