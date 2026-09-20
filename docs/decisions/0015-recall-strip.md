# 0015 — The recall strip

Date: 2026-09-20 · Status: accepted

## Context

ADR 0014 gave Brainlogs places, visits and change detection, but the user still had to open a window
to benefit. The product idea is the opposite: memory should arrive where the work is happening.

## Decision

A second Tauri window, `recall`, borderless, transparent, always on top, absent from the Dock and the
task switcher, hidden until it has something to say.

- **It loads the same UI bundle** as the main window with `?strip=1`, so there is one build, one
  origin and one API token. `App.tsx` renders `<RecallStrip/>` and nothing else for that query.
- **It never takes focus.** Created with `focused(false)` and shown with `show()`, never
  `set_focus()`, so typing continues in the app underneath.
- **It polls, it does not hook.** `current_window` returns the frontmost app and title from the same
  helper the capture engine uses. The strip asks every 1.5 s and only calls `/api/v1/recall` when the
  window actually changed, so the cost is one cheap Tauri call per tick and one query per switch.
- **It speaks only when it has something specific:** a second visit, a change since the last one, or
  a decision, question or promise on the record. A first visit to a new page shows nothing at all.
- **It hides itself** after eight seconds, and Escape suppresses that place for the session.

### What it says, by kind of place (1.3.0)

- **A document, a site, a repository** get the original card: visits, what changed since the last
  visit, and the decisions, questions and promises found in the text.
- **A person** gets what is between the two of you: how many conversations, when the last one was,
  and every open promise in either direction, with its due date. No line of the conversation is
  quoted. The words were said to someone; repeating them in a floating window over another app adds
  nothing the user cannot see by looking, and puts private text where a passer-by reads it.
- **A call** gets the same treatment for everyone the roster on screen names: who you are with, and
  what is owed with them. Calls are never diffed either — the screen is live by definition.

### Silence rules

The strip is a private note to one person, so it stays out of any moment where the screen is not
private:

- **A full-screen window.** The focused window's size is compared against its display through the
  Accessibility API; filling the display means a presentation, a video or a shared screen.
- **A title that announces sharing** — "is sharing", "presenting to", "stop sharing" and the rest of
  the phrases the call apps write into their window titles.
- **Private content is never quoted**, as described above for people and calls.

## Consequences

- No new permission: the frontmost window title already comes from the Accessibility grant that
  capture requires, and the strip reads nothing the engine was not already reading.
- Blocked apps, blocked domains and title rules are enforced before anything is stored, so a place
  that was never recorded can never be recalled either.
- Polling costs a Rust call every 1.5 s. The recall query runs only on a change of window, which on a
  normal day is a few hundred queries, each a bounded scan over the retention window.
- Full-screen detection is macOS-only for now; `foreground_window_size` returns nothing elsewhere,
  which fails open — the strip behaves exactly as it did before the rule existed.
- Reading commitments makes the strip depend on the graph as well as the timeline, so the endpoint
  now needs `readGraph` in addition to `readTimeline`. Both are read-only and both are audited.
- Windows and Linux inherit the window and the UI; `foreground_window_info` already has
  implementations there, so the port is the positioning code only.
