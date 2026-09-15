import { describe, expect, it } from "vitest";
import { clusterMoments, compose, detectIntent, parseScope, plan, cleanTitle } from "./plan.js";
import type { SearchHit } from "./types.js";
import type { Event } from "@brainlog/types";

const now = new Date("2026-09-15T13:00:00"); // local Tuesday

function ev(partial: Partial<Event> & { ts: string; windowTitle: string }): Event {
  return { id: `e-${partial.ts}-${partial.windowTitle}`.replace(/\W+/g, ""), app: "Google Chrome", bundleId: null, url: null, domain: "linkedin.com", text: partial.windowTitle, textHash: "0".repeat(64), sourceKind: "title", sensitivity: "none", expiresAt: "2026-10-15T00:00:00.000Z", ...partial };
}
const hit = (e: Event): SearchHit => ({ event: e, score: 1, highlights: [], entities: [] });

describe("plan", () => {
  it("detects intents", () => {
    expect(detectIntent("when did I last talk to Arez?")).toBe("when");
    expect(detectIntent("did i reachout to Rohit talluri?")).toBe("contact");
    expect(detectIntent("how much time did I spend on the pricing table")).toBe("duration");
    expect(detectIntent("what did I do yesterday")).toBe("day");
    expect(detectIntent("who is Priya")).toBe("who");
    expect(detectIntent("vec0 migration")).toBe("find");
  });
  it("parses time scopes and strips them from the subject", () => {
    const y = parseScope("what did I do yesterday", now);
    expect(y.scope.label).toBe("yesterday");
    expect(new Date(y.scope.from!).getDate()).toBe(14);
    const mon = parseScope("did I email Priya on monday", now);
    expect(new Date(mon.scope.from!).getDate()).toBe(14);
    const p = plan("did i reachout to Rohit talluri last week?", now);
    expect(p.intent).toBe("contact");
    expect(p.subject).toBe("Rohit talluri");
    expect(p.scope.label).toBe("last week");
  });
  it("cleans browser suffixes off titles", () => {
    expect(cleanTitle("Rohit Talluri | LinkedIn - High memory usage - 1,022 MB - Google Chrome")).toBe("Rohit Talluri | LinkedIn");
    expect(cleanTitle("(3) Messaging | LinkedIn - Arc")).toBe("Messaging | LinkedIn");
  });
  it("collapses repeated captures into one moment and answers a contact question", () => {
    const hits = [
      hit(ev({ ts: "2026-09-15T07:25:00.000Z", windowTitle: "Rohit Talluri | LinkedIn - Google Chrome" })),
      hit(ev({ ts: "2026-09-15T07:26:00.000Z", windowTitle: "Rohit Talluri | LinkedIn - High memory usage - 1,022 MB - Google Chrome" })),
      hit(ev({ ts: "2026-09-15T07:27:00.000Z", windowTitle: "Rohit Talluri | LinkedIn - Google Chrome" })),
    ];
    const moments = clusterMoments(hits);
    expect(moments).toHaveLength(1);
    expect(moments[0]!.count).toBe(3);
    const noMsg = compose(plan("did i reachout to Rohit talluri?", now), moments);
    expect(noMsg.verdict).toMatch(/^No conversation/);
    const withMsg = clusterMoments([...hits, hit(ev({ ts: "2026-09-15T07:30:00.000Z", windowTitle: "Messaging | LinkedIn", sensitivity: "third_party_private" }))]);
    const yes = compose(plan("did i reachout to Rohit talluri?", now), withMsg);
    expect(yes.verdict).toMatch(/^Yes\./);
    expect(yes.facts.find((f) => f.label === "Where")?.value).toContain("Messaging");
  });
  it("answers when and duration from moments", () => {
    const moments = clusterMoments([
      hit(ev({ ts: "2026-09-10T09:00:00.000Z", windowTitle: "Meet - Arez <> Shivank", domain: "meet.google.com" })),
      hit(ev({ ts: "2026-09-14T18:00:00.000Z", windowTitle: "Meet - Arez <> Shivank", domain: "meet.google.com" })),
      hit(ev({ ts: "2026-09-14T18:08:00.000Z", windowTitle: "Meet - Arez <> Shivank", domain: "meet.google.com" })),
    ]);
    expect(moments).toHaveLength(2);
    const when = compose(plan("when did I have a call with arez?", now), moments);
    expect(when.verdict).toMatch(/^Last .*Meet - Arez/);
    const dur = compose(plan("how long did I spend with arez", now), moments);
    expect(dur.verdict).toMatch(/^About \d+ min on Arez/);
  });
});
