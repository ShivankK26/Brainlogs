import { describe, expect, it } from "vitest";
import type { Event } from "@brainlog/types";
import { diffText, factsFrom, placeOf, placeTitle, visitsOf } from "./places.js";

function ev(p: Partial<Event> & { ts: string; windowTitle: string }): Event {
  return {
    id: `e-${p.ts}-${p.windowTitle}`.replace(/\W+/g, ""),
    app: "Google Chrome",
    bundleId: null,
    url: null,
    domain: null,
    text: p.windowTitle,
    textHash: "0".repeat(64),
    sourceKind: "ax",
    sensitivity: "none",
    expiresAt: "2026-11-01T00:00:00.000Z",
    ...p,
  };
}

describe("place identity", () => {
  it("strips browser, counter and memory-usage noise from titles", () => {
    expect(placeTitle("(3) Pricing table - Google Chrome")).toBe("Pricing table");
    expect(placeTitle("Sarvagya | LinkedIn - High memory usage - 1,022 MB")).toBe("Sarvagya | LinkedIn");
  });

  it("recognises docs, people, repos, calls and sites", () => {
    const doc = placeOf({ app: "Google Chrome", windowTitle: "Pricing table - Google Chrome", domain: "www.notion.so" })!;
    expect([doc.kind, doc.label]).toEqual(["doc", "Pricing table"]);

    const person = placeOf({ app: "WhatsApp", windowTitle: "Sarvagya Kulshreshtha" })!;
    expect([person.kind, person.label]).toEqual(["person", "Sarvagya Kulshreshtha"]);

    const repo = placeOf({ app: "Google Chrome", windowTitle: "Release v1.0.24 · ShivankK26/Brainlogs", domain: "github.com" })!;
    expect([repo.kind, repo.label]).toEqual(["repo", "ShivankK26/Brainlogs"]);

    const call = placeOf({ app: "Google Chrome", windowTitle: "Meet · Arez <> Shivank", domain: "meet.google.com" })!;
    expect(call.kind).toBe("call");

    const site = placeOf({ app: "Google Chrome", windowTitle: "Payments Engineer | LinkedIn", domain: "www.linkedin.com" })!;
    expect(site.kind).toBe("site");
  });

  it("gives the same key to the same page seen through browser noise", () => {
    const a = placeOf({ app: "Google Chrome", windowTitle: "Pricing table - Google Chrome", domain: "www.notion.so" })!;
    const b = placeOf({ app: "chrome", windowTitle: "(2) Pricing table - High memory usage - 512 MB - Google Chrome", domain: "www.notion.so" })!;
    expect(a.key).toBe(b.key);
  });
});

describe("visits", () => {
  it("groups captures into visits with a ten-minute gap", () => {
    const vs = visitsOf([
      ev({ ts: "2026-09-18T09:00:00.000Z", windowTitle: "Pricing table", text: "a" }),
      ev({ ts: "2026-09-18T09:04:00.000Z", windowTitle: "Pricing table", text: "a b" }),
      ev({ ts: "2026-09-18T16:00:00.000Z", windowTitle: "Pricing table", text: "a b c" }),
    ]);
    expect(vs).toHaveLength(2);
    expect(vs[0]!.eventIds).toHaveLength(2);
    expect(vs[0]!.text).toBe("a b");
    expect(vs[1]!.ms).toBe(30_000);
  });
});

describe("what changed", () => {
  it("describes a row edited in place", () => {
    const before = "Starter $29\nTeam $79\nEnterprise $499/mo";
    const after = "Starter $29\nTeam $79\nEnterprise contact us";
    const d = diffText(before, after)!;
    expect(d.summary).toBe("“Enterprise $499/mo” became “Enterprise contact us”.");
  });

  it("describes additions and removals, and stays silent when nothing moved", () => {
    expect(diffText("a line here\nsecond line", "a line here\nsecond line\nIndia row pending")!.summary).toBe('New since your last visit: “India row pending”.');
    expect(diffText("only this line\nand this", "only this line")!.summary).toBe("Gone since your last visit: “and this”.");
    expect(diffText("same text\nboth times", "same text\nboth times")).toBeNull();
  });
});

describe("facts", () => {
  it("picks decisions, open questions and promises out of captured text", () => {
    const f = factsFrom([
      ev({ ts: "2026-09-09T15:04:00.000Z", windowTitle: "Pricing table", text: "We agreed Starter $29 and Team $79 with Arjun\nOpen question: annual discount\nReady to scale outside the App Store?" }),
      ev({ ts: "2026-09-14T18:31:00.000Z", windowTitle: "Meet", text: "I'll send the deck by Thursday" }),
    ]);
    expect(f.map((x) => x.kind)).toEqual(["promise", "decision", "question"]);
    expect(f[1]!.text).toContain("Starter $29");
  });
  it("ignores marketing questions and terminal session titles", () => {
    expect(factsFrom([ev({ ts: "2026-09-20T08:31:00.000Z", windowTitle: "Zellify", text: "Need something custom?\nReady to scale outside the App Store?" })])).toEqual([]);
    const term = placeOf({ app: "iTerm2", windowTitle: "✳ Brainlog desktop app" })!;
    expect([term.kind, term.label]).toEqual(["app", "Brainlog desktop app"]);
    const repo = placeOf({ app: "iTerm2", windowTitle: "brainlog — zsh" })!;
    expect([repo.kind, repo.label]).toEqual(["repo", "brainlog"]);
    expect(placeOf({ app: "WhatsApp", windowTitle: "\u200e" })).toBeNull();
    expect(placeOf({ app: "Google Chrome", windowTitle: "New tab" })).toBeNull();
  });
});
