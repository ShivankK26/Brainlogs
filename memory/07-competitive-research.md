# Products studied, and what was taken

The owner sent each of these and asked what to learn from it. The pattern in
the answers: take interaction ideas, refuse anything that needs a model budget.

## littlebird.ai

Studied for UI. Verdict: very clean, chat-centred, and expensive to run because
the chat is the product. The owner's instruction was explicit: "dont copy paste
the entire littlebird's ui brainstorm and make it more better", and later "i
dont wanna copy it also it requires high llm cost can we figure out smething
simpler? and cleaner and much much much much more actionable". That rejection
is what led to the Recall direction.

## screenpipe.com

Continuous screen recording with search. Confirms the capture category but it
stores video and ships an app store of plugins. Brainlogs stores text only,
which is what makes diffing two visits possible at all, and what keeps the
database small.

## tinyhumansai/openhuman

Looked at during the design rounds. Useful as a prompt for a different shape;
the owner's reaction was "this is okay i mean but we can still make something
better out of it", and the next iteration became Recall.

## supermemoryai/company-brain (open sourced, Apache 2.0)

A Slack bot that remembers what a team says and then acts: opens issues, reads
PRs, digs in repos, and speaks up unprompted. TypeScript on Cloudflare Workers,
Durable Objects and D1, memory in Supermemory's hosted API, tools over MCP,
plus a sandbox.

Recommendation given: **do not build on it.** Every answer is a model call and
its memory is a hosted paid dependency, which contradicts both standing rules.
Worth taking as ideas: permissions as a property of the memory graph, and
scheduled digests. Its unprompted "speaks up when it knows something" is the
same instinct as the strip, which is reassuring rather than actionable.

## heyclicky.com

A Mac assistant: hotkey, sees your screen, voice, draws on screen, agent does
tasks. Twenty dollars a month, a hundred for agents, because every interaction
is a frontier model call with images.

Recommendation given: **do not build it.** The one thing worth taking is the
summon: a hotkey that answers over your work without switching windows. The
strip is push-only today; a hotkey would make it pull as well, with no model
and no cost. Drawing and voice both need a model; skip them.

## goldfish.sh

The nearest neighbour found so far. Mac and Windows, learns how you write,
keeps context on the device, and on a keypress writes the reply for you
wherever you are typing. Good Product Hunt run, notable users, no public price.

Recommendation given: three things to take, all model-free.

1. **Insert at the cursor.** Brainlogs already holds the Accessibility grant,
   so it can write into the front app's text field with no new permission.
2. **"You've answered this before."** Search your own captured text for the
   closest thing you previously replied to and show that reply. Tone-matched by
   construction, because you wrote it. This is the strongest of the three.
3. **A writing fingerprint** computed deterministically from your own messages:
   real greetings and sign-offs, length, emoji rate, habitual phrases.

Refused: the generation itself, and the Option key as a trigger (macOS uses it
for accented characters).

## The standing advice

Three competitors in a row each produced a list of things to add while the
product still had one user and an undeployed landing page. The repeated
recommendation was to get the site live and the app into a handful of hands,
and let what people reach for decide which of these ideas is real.
