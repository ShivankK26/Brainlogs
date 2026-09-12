import { describe, expect, it } from "vitest";
import type { Event } from "@brainlog/types";
import { sessionize, weekBounds } from "./pulse.js";

const ev = (id: string, ts: string, app: string, title: string): Event => ({
  id, ts, app, bundleId: null, windowTitle: title, url: null, domain: null, text: title, textHash: "x".repeat(64), sourceKind: "title", sensitivity: "none", expiresAt: ts,
});

describe("pulse helpers", () => {
  it("weekBounds starts on Monday", () => {
    expect(weekBounds("2026-09-09")).toEqual({ start: "2026-09-07T00:00:00.000Z", end: "2026-09-14T00:00:00.000Z" });
    expect(weekBounds("2026-09-07").start).toBe("2026-09-07T00:00:00.000Z");
  });
  it("sessionize merges consecutive same-region events within the gap", () => {
    const s = sessionize([
      ev("a", "2026-09-09T10:00:00.000Z", "Code", "db.ts"),
      ev("b", "2026-09-09T10:02:00.000Z", "Code", "db.ts"),
      ev("c", "2026-09-09T10:03:00.000Z", "Slack", "DM"),
      ev("d", "2026-09-09T10:20:00.000Z", "Code", "db.ts"),
    ]);
    expect(s.map((x) => x.eventIds)).toEqual([["a", "b"], ["c"], ["d"]]);
    expect(s[0]!.end - s[0]!.start).toBe(2 * 60_000 + 30_000);
  });
});
