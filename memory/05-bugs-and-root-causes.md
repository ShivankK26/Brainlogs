# Bugs and what actually caused them

The useful part of this file is the pattern: in almost every case the symptom
was silence, and the cause was a permission, a signature or a platform
behaviour, not the logic that looked wrong.

## The strip never appeared (1.2.0, 1.3.0)

Two whole versions shipped a feature that could not run. The window spawned,
the React code ran, and every `invoke("current_window")` was rejected, because
the UI is served from the core over http and a remote origin may only call the
commands a capability names. `permissions/widget.toml` listed the widget's
commands and not the strip's three. Fixed in 1.3.1 by adding them, and
`apps/desktop/test/capability.test.ts` now fails the build if any registered
command is missing from that list, in either direction.

## The strip spoke twice and went quiet (1.3.1)

With the IPC allowed, it polled, hid itself when it had nothing to say, and
never ticked again: macOS suspends the timers of a window that is not on
screen, so hiding switched off the clock it needs to notice the next window.
Fixed in 1.3.2 by parking it as a one-pixel transparent click-through window
instead of hiding, and by having the shell watch the front window and emit
`recall-front`.

**How it was caught**: `recall_poll_age_s` was added to the engine status in
1.3.1 precisely because a silent strip is invisible. A climbing number in a
status file is what made the second bug obvious within minutes.

## Every release was a draft

The publish job created a draft and nothing ever published it. A draft serves
no downloads, so the one-line installer 404s on its own assets, and the updater
cannot read a draft's `latest.json`, so in-app updates were dark too. Earlier
releases had been published by hand, which hid the bug. Fixed on 2026-09-20.

## Capture went blind after every update

Ad-hoc signing changed the designated requirement on every build, so macOS
revoked the Accessibility grant. Fixed by a stable self-signed identity
(`docs/decisions/0012`). Recovering an already-broken grant needs
`tccutil reset Accessibility io.brainlog.desktop` once.

## A person fractured into four strangers

WhatsApp titles its window "Name -  voice call" during a call, "— typing…"
while they write, "· online" otherwise, and prefixes an unread count. Each
variant became its own place with one visit. Fixed by reducing chat titles to
the name and stripping invisible direction marks from the app name too.

## A document was two places

The same page in the Notion app and in a Chrome tab had different keys, so half
its history was invisible from either side. Fixed by resolving native document
apps to the same `page:` key as their web origin.

## "X became X"

The diff paired two long lines, clipped both to sixty characters, and printed a
sentence whose halves were identical. Fixed by dropping pairs whose clipped
forms match, and by describing churn instead of quoting it.

## Memory showed the wrong week

`eventsBetween` sorted ascending and then applied a 2000-row cap, so a long
range returned the oldest events. Fixed by selecting newest-first and
reversing.

## A stale core served a new UI

An old core from a previous install kept answering, so the interface and the
API disagreed. Fixed with `bundleVersion` in `/api/health` and a
`core_is_current()` check in the shell.

## Overview claimed 37-hour days

Sessions were summed, and overlapping windows counted twice. Fixed with
`unionMs()`.

## The app vanished seconds after installing (1.3.0)

The installer printed success and the bundle was gone. Never explained. The
installer now verifies the copy, retries once, and exits non-zero rather than
lying. A second disappearance was the Mac killing the app under memory
pressure, which is a different thing and showed up as `recall_poll_age_s: null`.

## Smaller ones worth remembering

- `transparent` on a window needs the `macos-private-api` cargo feature and
  `app.macOSPrivateApi` in the config, and `skip_taskbar` must be gated off
  macOS or the build fails.
- Junk commitments came from LinkedIn previews, broadcasts and acronyms;
  junk people from words like "Register" and "Role". Both have filters and a
  reclassify pass in the graph job.
- e2e once ran against a stale bundle because lint aborted the chain before
  the build. Rebuild, then rerun.
