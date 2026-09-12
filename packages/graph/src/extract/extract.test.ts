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
