import { describe, expect, it } from "vitest";
import { clusterMoments, compose, detectIntent, looksLikePersonName, parseContact, parseScope, plan, cleanTitle, termsOf } from "./plan.js";
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
    hits.push(hit(ev({ ts: "2026-09-15T07:27:30.000Z", windowTitle: "Rohit Talluri | LinkedIn", app: "chrome", domain: null })));
    const p = plan("did i reachout to Rohit talluri?", now);
    const terms = { person: termsOf(p.person) };
    const moments = clusterMoments(hits, terms);
    expect(moments).toHaveLength(1); // "chrome" history rows merge with "Google Chrome" captures
    expect(moments[0]!.count).toBe(4);
    expect(moments[0]!.kind).toBe("page");
    const noMsg = compose(p, moments);
    expect(noMsg.verdict).toMatch(/^No, nothing sent to Rohit Talluri/);
    const withMsg = clusterMoments([...hits, hit(ev({ ts: "2026-09-15T07:30:00.000Z", windowTitle: "Messaging | LinkedIn", sensitivity: "third_party_private", text: "Rohit Talluri\nYou: hi Rohit, quick question" }))], terms);
    const yes = compose(p, withMsg);
    expect(yes.verdict).toMatch(/^Yes\. You messaged Rohit Talluri in LinkedIn messages/);
    expect(yes.facts.find((f) => f.label === "Where")?.value).toContain("Messaging");
    expect(yes.facts.find((f) => f.label === "Captured text")?.value).toContain("quick question");
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
  it("separates the person from the topic in contact questions", () => {
    expect(parseContact("did i send sarvagya a message asking about base pay")).toEqual({ person: "sarvagya", topic: "base pay" });
    expect(parseContact("did I reach out to Rohit Talluri")).toEqual({ person: "Rohit Talluri", topic: undefined });
    expect(parseContact("have we emailed Priya about the invoice")).toEqual({ person: "Priya", topic: "the invoice" });
    const p = plan("did i send sarvagya a message asking about base pay?", now);
    expect(p.person).toBe("sarvagya");
    expect(p.subject).toBe("sarvagya");
  });
  it("verifies the topic inside the chat text and drops unrelated partial matches", () => {
    const p = plan("did i send sarvagya a message asking about base pay?", now);
    const terms = { person: termsOf(p.person), topic: termsOf(p.topic) };
    const hits = [
      hit(ev({ ts: "2026-09-15T08:27:00.000Z", windowTitle: "WhatsApp", app: "WhatsApp", domain: null, sensitivity: "third_party_private", text: "Sarvagya Kulshreshtha\nYou: hey, what is the base pay for the payments role?\nSarvagya: around 30L" })),
      hit(ev({ ts: "2026-09-14T11:06:00.000Z", windowTitle: "Payments Engineer - Google Chrome", text: "Payments Engineer job\nbase pay 25L" })),
      hit(ev({ ts: "2026-09-03T13:25:00.000Z", windowTitle: "Sarvagya Kulshreshtha (@sarvagya_kul) / X - Google Chrome", text: "Sarvagya Kulshreshtha posts" })),
    ];
    const moments = clusterMoments(hits, terms);
    const yes = compose(p, moments);
    // date formatting differs by locale ("Sep" vs "Sept"), so match the shape, not the exact string
    expect(yes.verdict).toMatch(/^Yes\. You messaged Sarvagya on WhatsApp about base pay, .+\d{2}:\d{2}.*\.$/);
    expect(yes.facts.find((f) => f.label === "Captured text")?.value).toContain("base pay");
    expect(yes.moments.map((m) => m.title)).not.toContain("Payments Engineer");
    expect(yes.moments.map((m) => m.title)).toContain("Sarvagya Kulshreshtha (@sarvagya_kul) / X");
    // chat exists but never mentions the topic
    const noTopic = compose(p, clusterMoments([hit(ev({ ts: "2026-09-15T08:27:00.000Z", windowTitle: "WhatsApp", app: "WhatsApp", domain: null, sensitivity: "third_party_private", text: "Sarvagya: see you tomorrow" }))], terms));
    expect(noTopic.verdict).toMatch(/^Partly\. .*nothing about “base pay” was captured/);
  });
  it("tells names from interface words", () => {
    for (const ok of ["Priya", "Rohit Talluri", "Sarvagya Kulshreshtha", "Arez"]) expect(looksLikePersonName(ok)).toBe(true);
    for (const no of ["username", "Register", "Batch", "CTC", "Sign in", "user123", "Inbox", "Today"]) expect(looksLikePersonName(no)).toBe(false);
  });
});
