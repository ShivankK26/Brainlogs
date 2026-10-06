# What shipped, version by version

`CHANGELOG.md` is the user-facing record. This is the same history with the
reasoning and the mistakes left in.

## 1.0.x (earlier sessions)

The product itself: capture, search, Ask with no model, Overview, Commitments,
People and projects, the privacy and audit surfaces, the self-signed signing
identity that keeps the Accessibility grant alive (1.0.11), the in-app updater
(1.0.13), and a long run of UI corrections from the owner ending at 1.0.24
("Top screens", "Active time", the Agents page removed).

## 1.1.0 — Places

Everything grouped by the thing you return to rather than by the clock. A
Places screen with visit counts and a week sparkline, per-visit diffs, and the
read-only endpoints `/recall`, `/places`, `/places/:key`. The engine is
`packages/query/src/places.ts` and uses no model (ADR 0014).

## 1.2.0 — The recall strip

A second always-on-top transparent window that says what you already know about
the window in front of you (ADR 0015). It did not work on a real machine; see
below. The first build also failed because `transparent` needs the
`macos-private-api` feature.

## 1.2.1 — Identity and diff quality

A document is one place whether opened in its native app or a browser tab.
Terminals, chats and calls are no longer diffed. Churn is described rather than
quoted, and a change sentence whose halves read the same is dropped.

## 1.3.0 — People, calls, silence

A person's card shows conversations and open promises in either direction and
quotes none of the conversation. Calls get the same for the roster on screen.
`screenIsShared` keeps the strip off a shared or full screen. Also still not
visible on a real machine.

## 1.3.1 — The reason it never appeared

The strip's three commands were missing from the capability allow-list, so
every call since 1.2.0 had been denied. Added them, and added
`recall_poll_age_s` to the engine status so a silent strip is a fact rather
than an absence. Also: the installer now verifies its own copy, and the release
workflow publishes releases instead of leaving them drafted.

## 1.3.2 — Keeping it awake

It spoke twice and stopped: macOS suspends a hidden window's timers. It now
parks as a one-pixel transparent click-through window, and the shell watches
the front window and nudges it.

## 1.3.3 — Not about itself

Switching to Brainlogs produced a card about Brainlogs. Skipped.

## 1.4.0 — A way to shut it up

A close button and a "quiet 10m" button on the card. A menu bar menu: quiet for
ten minutes, an hour, the rest of today, off, back on, with capture's pause
below a separator. Settings repeats the switch and says when it returns.

## 1.4.1 — The menu opens on a click

The controls shipped behind a right-click, which nobody tries on a status icon.

## What the sequence should teach

Four versions were shipped before the feature worked once. Every failure was
silent, and each was found only by instrumenting something that could be read
from outside the app: a version in a status file, a poll age, an audit row.
When a surface appears to do nothing, make it report a number before changing
any logic.
