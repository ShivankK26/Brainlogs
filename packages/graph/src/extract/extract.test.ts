import { describe, expect, it } from "vitest";
import type { Event } from "@brainlog/types";
import { extractMentions, speakerTurns } from "./deterministic.js";
import { extractCommitments } from "./commitments.js";
import { parseDue } from "../due.js";

const ev = (over: Partial<Event>): Event => ({
  id: "e1", ts: "2026-09-09T15:40:00.000Z", app: "Slack", bundleId: null, windowTitle: "", url: null, domain: null, text: "", textHash: "x".repeat(64), sourceKind: "ax", sensitivity: "none", expiresAt: "2026-10-09T15:40:00.000Z", ...over,
});

describe("parseDue", () => {
  const now = new Date("2026-09-09T15:40:00+05:30"); // Wednesday
  it("weekdays, tomorrow, eow, next week, ISO", () => {
    expect(parseDue("I'll get you the spec by Friday", now)?.slice(0, 10)).toBe("2026-09-11");
    expect(parseDue("tomorrow", now)?.slice(0, 10)).toBe("2026-09-10");
    expect(parseDue("by wednesday", now)?.slice(0, 10)).toBe("2026-09-16");
    expect(parseDue("end of week", now)?.slice(0, 10)).toBe("2026-09-11");
    expect(parseDue("next week", now)?.slice(0, 10)).toBe("2026-09-14");
    expect(parseDue("on 2026-10-01", now)?.slice(0, 10)).toBe("2026-10-01");
    expect(parseDue("in 3 days", now)?.slice(0, 10)).toBe("2026-09-12");
    expect(parseDue("no date here", now)).toBeNull();
  });
});

describe("extractMentions", () => {
  it("repos from URLs, remotes and terminal owner/name; branches from git commands and prefixes", () => {
    const m = extractMentions(ev({ app: "Terminal", sourceKind: "terminal", windowTitle: "zsh — brainlog", text: "$ git clone git@github.com:asg017/sqlite-vec.git\n$ git checkout -b feat/graph-edges\nSwitched to a new branch 'feat/graph-edges'" }), { chat: false });
    expect(m).toContainEqual({ kind: "repo", name: "asg017/sqlite-vec", confidence: 1 });
    expect(m.filter((x) => x.kind === "branch")).toEqual([{ kind: "branch", name: "feat/graph-edges", confidence: 1 }]);
  });
  it("docs from doc hosts, people from DM titles, @mentions and speakers", () => {
    const d = extractMentions(ev({ app: "Firefox", url: "https://www.notion.so/x", domain: "www.notion.so", windowTitle: "Onboarding — week 2 · Notion", text: "Pricing table" }), { chat: false });
    expect(d).toEqual([{ kind: "doc", name: "Onboarding — week 2", confidence: 1 }]);
    const p = extractMentions(ev({ windowTitle: "DM · Priya", text: "You: @arjun can you look?\nPriya: sure" }), { chat: true });
    expect(p.map((x) => `${x.kind}:${x.name}`).sort()).toEqual(["person:Priya", "person:arjun"]);
  });
  it("ignores paths that look like owner/name", () => {
    const m = extractMentions(ev({ app: "Terminal", sourceKind: "terminal", text: "packages/core/src/db.ts\nsrc/index.ts" }), { chat: false });
    expect(m.filter((x) => x.kind === "repo")).toEqual([]);
  });
});

describe("speakerTurns + extractCommitments", () => {
  it("splits turns and finds a promise with a due date and a request", () => {
    expect(speakerTurns("You: hi\nthere\nPriya: yo")).toEqual([{ name: "You", self: true, text: "hi\nthere" }, { name: "Priya", self: false, text: "yo" }]);
    const c = extractCommitments(ev({ windowTitle: "DM · Priya", text: "You: I'll get you the memory-layer spec by Friday.\nPriya: perfect, I'll block time Friday afternoon.\nPriya: can you also send the Ollama notes?" }), { contact: "Priya" });
    expect(c.map((x) => [x.fromParty, x.toParty, x.intent, x.dueAt?.slice(0, 10) ?? null])).toEqual([
      ["you", "Priya", "promise", "2026-09-11"],
      ["Priya", "you", "promise", "2026-09-11"],
      ["Priya", "you", "request", null],
    ]);
  });
});

describe("people from chat text", () => {
  const base = { id: "e1", ts: "2026-09-15T08:00:00.000Z", app: "WhatsApp", bundleId: null, windowTitle: "WhatsApp", url: null, domain: null, textHash: "0".repeat(64), sourceKind: "ax" as const, sensitivity: "third_party_private" as const, expiresAt: "2026-10-15T00:00:00.000Z" };
  it("ignores one-off Label: value lines and keeps repeated speakers", () => {
    const text = "Role: Senior Engineer\nLocation: Bangalore\nExperience: 5 years\nSarvagya: hey\nYou: hi\nSarvagya: base pay kitna?";
    const people = extractMentions({ ...base, text }, { chat: true }).filter((m) => m.kind === "person").map((m) => m.name);
    expect(people).toEqual(["Sarvagya"]);
  });
  it("keeps two-word speakers even when they speak once", () => {
    const text = "Rohit Talluri: can we talk tomorrow?\nYou: sure";
    const people = extractMentions({ ...base, text }, { chat: true }).filter((m) => m.kind === "person").map((m) => m.name);
    expect(people).toEqual(["Rohit Talluri"]);
  });
});

describe("commitments skip inbox previews and unnamed counterparts", () => {
  const base = { id: "e2", ts: "2026-09-15T08:00:00.000Z", app: "Google Chrome", bundleId: null, windowTitle: "Messaging | LinkedIn", url: null, domain: "linkedin.com", textHash: "0".repeat(64), sourceKind: "ax" as const, sensitivity: "third_party_private" as const, expiresAt: "2026-10-15T00:00:00.000Z" };
  it("ignores LinkedIn preview text", () => {
    const text = "Ajay Yadav: message, Can you give me a reminder on Monday, 12:44 PM, Received from Ajay Yadav Neatlogs CEO\nYou: Your message, Heyy, could you pls let me know the availability of slots?";
    expect(extractCommitments({ ...base, text }, { contact: "Ajay Yadav" })).toEqual([]);
  });
  it("keeps a real request with a named counterpart and drops one without", () => {
    const real = extractCommitments({ ...base, text: "Priya: can you send me the pricing table by Friday?\nYou: sure" }, { contact: "Priya" });
    expect(real.map((c) => [c.fromParty, c.toParty, c.intent])).toEqual([["Priya", "you", "request"]]);
    const channel = extractCommitments({ ...base, windowTitle: "#general", text: "You: can you send me the pricing table by Friday?" }, { contact: null });
    expect(channel.map((c) => c.toParty)).toEqual(["#general"]);
    const unnamed = extractCommitments({ ...base, windowTitle: "Messaging", text: "You: can you send me the pricing table by Friday?" }, { contact: null });
    expect(unnamed).toEqual([]);
  });
  it("ignores group broadcasts and label speakers", () => {
    const text = "Batch: If you or anyone you know has A−ve blood and can donate, please come forward and help.\nBatch: Please share this message widely with your friends, family, colleagues and WhatsApp groups";
    expect(extractCommitments({ ...base, windowTitle: "Batch", text }, { contact: null })).toEqual([]);
  });
  it("ignores donation appeals, résumé fields and previews with invisible marks", () => {
    const cases = [
      { title: "Raspberry Pi", text: "Raspberry Pi: Please call/message immediately if you can donate." },
      { title: "WhatsApp", text: "You: Seeking Associate Product Manager roles where I can turn user research into growth\nCGPA: 8.9" },
      { title: "Messaging | LinkedIn", text: "\u200eYour message, awesome perfect i'll ping you, 15Septemberat12:50 PM, \u200eSent to Ajay Yadav Neatlogs CEO" },
    ];
    for (const c of cases) expect(extractCommitments({ ...base, windowTitle: c.title, text: c.text }, { contact: null })).toEqual([]);
  });
});
