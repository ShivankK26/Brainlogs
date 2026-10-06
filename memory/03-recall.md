# Recall: places, visits, change, and the strip

The idea the owner picked, in their words: "i think i really like this new ux,
start building it". Memory that surfaces itself where you work, rather than a
place you have to go and search.

Decisions are recorded in `docs/decisions/0014-places-and-recall.md` and
`0015-recall-strip.md`. This file is the working knowledge around them.

## The engine: `packages/query/src/places.ts`

No model anywhere in it. It is string work over events already in the database,
and it is covered by `places.test.ts` (plus a person-recall case in
`api.test.ts`).

- **A place** is a thing you return to: `doc`, `person`, `repo`, `site`, `call`
  or `app`, identified by `kind:normalised-name`. Identity is the hard part and
  nearly every bug lived here. Browser pages key on the cleaned title alone and
  never on the domain, because the same page arrives both as a window capture
  with no domain and as a history row with one. The domain only upgrades the
  kind. Native document apps (Notion, Linear, Obsidian and friends) resolve to
  the same `page:` key as their web origin, so a document is one place whether
  you read it in the app or in a tab.
- **Visits** group a place's events with a ten-minute gap, keeping the longest
  captured text per visit as the basis for the diff.
- **Change** is a line diff between consecutive visits, phrased as a sentence.
  Only documents, sites and repositories are diffed. Terminals, chats and calls
  scroll by design and "34 lines removed" there is noise wearing the clothes of
  insight. A page that moved more than a dozen lines is described as
  substantially rewritten rather than quoting one line at random, and a paired
  edit whose halves read the same once shortened is dropped.
- **Facts** are decisions, questions and promises found in the text.
- **Owed** are open commitments with the person in front of you, in either
  direction, from the graph.

### The rule about conversations

A person's card and a call's card quote nothing from the captured text. Those
words were said to someone, they are already on the screen, and repeating them
in a window that floats over other apps only moves private text somewhere a
passer-by can read it. People and calls get visit counts and commitments
instead. This is deliberate; do not "fix" it by adding quotes.

## The strip

A second Tauri window named `recall`, borderless, transparent, always on top,
never focused, loading the same UI bundle at `/?strip=1`. It polls the front
window every 1.5 seconds and queries the core only when the place changes. It
speaks only when it has something specific: a return visit, a change, a fact or
an open promise. A first visit to a new page shows nothing.

Three things about it are counter-intuitive and all three were learned the hard
way (see `05-bugs-and-root-causes.md`):

1. Its commands must be listed in `apps/desktop/src-tauri/permissions/widget.toml`
   or every call is silently denied.
2. It must never be hidden, only parked as a one-pixel transparent window that
   ignores the mouse, because macOS suspends a hidden webview's timers.
3. The shell also watches the front window itself and emits `recall-front`, so
   the strip is woken from outside even if its own clock is throttled.

### Silence and control

- `screenIsShared()` in `@brainlog/types` keeps it off any screen that may not
  be private: a window filling its display, or a title announcing sharing or
  presenting. It fails open, since a strip that never appears is not a product.
- The card carries a close button and a "quiet 10m" button.
- The menu bar icon opens a menu on a plain left click: quiet for ten minutes,
  an hour, the rest of today, off, or back on, with capture's own pause below a
  separator. The mute state is one timestamp in the shell, read by
  `current_window` on the poll the strip already makes.
- Settings repeats the switch and says when it will speak again.
