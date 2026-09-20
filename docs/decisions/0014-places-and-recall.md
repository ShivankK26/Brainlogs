# 0014 — Places, visits and “what changed since you were last here”

Date: 2026-09-20 · Status: accepted

## Context

Through 1.0.24 every screen in Brainlogs was a report about a day the user had already lived: a
timeline, a set of weekly measures, a list of commitments. Reports are read once and then ignored,
and the user's own verdict on four iterations of that idea was that none of them were worth opening.

The data we hold supports something better. Because capture is **text, not screenshots**, two visits
to the same document can be compared with string operations. Screenpipe would have to OCR and
compare frames; Littlebird would have to send both versions to a model. We compare two strings, for
free, on device.

## Decision

Brainlogs becomes a **recall** product. The organising unit is the **place** — a thing you return
to — rather than the day.

1. **Place identity** (`packages/query/src/places.ts::placeOf`) maps a window to a stable key:
   - Browser pages are keyed by their cleaned title (`page:<title>`), never by domain. The same page
     arrives both as a window capture with no domain and as a browser-history row with one, and both
     must resolve to the same place. A known domain only upgrades the *kind* to `doc`, `repo` or `call`.
   - Chat windows resolve to `person:<name>`; terminals to `repo:<dir>` for a single-token directory
     and `app:terminal|<title>` for a session title such as “✳ Brainlog desktop app”.
   - Invisible direction marks, unread counters, browser suffixes and “High memory usage …” are
     stripped before keying, and a junk list (`new tab`, `untitled`, `inbox`, …) yields no place at all.
2. **Visits** group a place's events with a ten-minute gap, and carry the longest captured text of
   the visit as the basis for comparison.
3. **Change detection** (`diffText`) is line-level and deterministic. It pairs an added line with the
   removed line sharing its first word, so an edited row reads “*Enterprise $499/mo* became
   *Enterprise contact us*”, and otherwise reports additions or removals. Noise-only differences
   return `null`, because saying nothing is better than saying “something changed”.
4. **Facts** are decisions, open questions and promises found in a place's text. Questions require an
   explicit marker or a first-person form: marketing pages end every line in a question mark.
5. The query API gains `recallPlace`, `places` and `placeHistory`, all gated and audited like every
   other read. The worker exposes `/api/v1/recall`, `/places` and `/places/:key`.

## Consequences

- The window's Places screen and the desktop **recall strip** (ADR 0015) read the same three calls,
  so the strip has no privileged path into the database.
- Recall runs over the retention window only. A place last seen 40 days ago has no history, which is
  correct: the raw text is gone.
- Place keys are computed, not stored. If the rules change, keys change; nothing durable references
  them, and the cost is one recomputation.
- `visible()` still filters every event, so a blocked or private moment can never reach a recall.
