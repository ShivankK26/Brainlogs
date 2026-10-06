# What to build next

In the order I would do it, with the reasoning, so it can be argued with.

## 1. Deploy the landing page and turn the buttons on

`apps/site` is built and dead. Until a stranger can download this, every
feature is theoretical. The buttons were switched off deliberately ("just for
the time being keep download button unclickable, we'll fix this later") and the
GitHub links removed. Point them at the one-line installer and the latest .dmg.
This is small and it is the only thing blocking feedback.

## 2. A hotkey that summons the strip

The strip is push-only: it speaks when it judges it has something. A global
hotkey that asks "what do I know about this window" on demand makes it
dependable rather than occasional, and the window, the query and the rendering
all already exist. No model, no cost. This is the one idea worth taking from
HeyClicky.

## 3. "You've answered this before"

Given the message in front of you, find the closest thing you previously
replied to and show your own reply. Tone-matched because you wrote it, and
deterministic because it is search. The idea taken from Goldfish, and the
strongest of the three.

## 4. Insert at the cursor

The plumbing for both of the above becoming useful: write text into the front
app's text field using the Accessibility grant Brainlogs already holds. No new
permission, no new prompt.

## 5. Click through from the strip into the place

Today the card is a dead end. It should open that place's full history in the
main window. Needs an event from the shell to the main webview and a route in
the app; the Places screen already renders the destination.

## Later, or maybe never

- **Connectors** for Calendar and Gmail, read-only. Real value, meaningful
  scope, and OAuth client setup the owner has not asked for yet.
- **Scheduled digests**, the one idea worth taking from Company Brain: be
  useful without being asked.
- **Drafting with a local model**, gated behind Ollama with an honest note that
  it is slower. Only after the deterministic surfaces are proven.
- **Permissions in the memory graph**, which only matters once anything is
  shared with anyone.

## Housekeeping that is waiting on the owner

- npm publish needs `NPM_TOKEN` and `PUBLISH_NPM=true`.
- Windows and Linux installers have never been run.
- The e2e suite needs `pnpm exec playwright install chromium` after an update.
