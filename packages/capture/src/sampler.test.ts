import { describe, expect, it } from "vitest";
import { Sampler } from "./sampler.js";
import { newLines } from "./diff.js";

const t = (s: number) => new Date(Date.UTC(2026, 8, 9, 15, 0, s)).toISOString();

describe("newLines", () => {
  it("returns only lines not present before", () => {
    expect(newLines("a\nb", "a\nb\nc\nc\n b ")).toEqual(["c"]);
  });
});

describe("Sampler", () => {
  it("stores window re-focus but dedups identical text otherwise", () => {
    const s = new Sampler(new Map());
    const win = { ts: t(0), app: "Code", windowTitle: "db.ts", url: null, text: "db.ts", titleOnly: true, cls: "editor" as const };
    expect(s.decide(win).action).toBe("store");
    expect(s.decide({ ...win, ts: t(1) })).toEqual({ action: "skip", reason: "unchanged" });
    expect(s.decide({ ts: t(2), app: "Slack", windowTitle: "#eng", url: null, text: "#eng", titleOnly: true, cls: "chat" }).action).toBe("store");
    expect(s.decide({ ...win, ts: t(3) }).action).toBe("store"); // re-focus keeps the timeline
  });
  it("browser: once per URL per focus session, text changes within a session are skipped", () => {
    const s = new Sampler(new Map());
    const page = { ts: t(0), app: "Firefox", windowTitle: "Docs", url: "https://x.dev/a", text: "intro", titleOnly: false, cls: "browser" as const };
    expect(s.decide(page).action).toBe("store");
    expect(s.decide({ ...page, ts: t(5), text: "intro\nscrolled" })).toEqual({ action: "skip", reason: "same_session" });
    s.decide({ ts: t(6), app: "Terminal", windowTitle: "zsh", url: null, text: "$ ls", titleOnly: false, cls: "terminal" });
    const back = s.decide({ ...page, ts: t(7), text: "intro\nscrolled" });
    expect(back.action).toBe("store");
  });
  it("terminal: diff only, 30 s cadence, immediate on switch", () => {
    const s = new Sampler(new Map());
    const term = (sec: number, text: string) => s.decide({ ts: t(sec), app: "Terminal", windowTitle: "zsh", url: null, text, titleOnly: false, cls: "terminal" });
    expect(term(0, "a").action).toBe("store");
    expect(term(10, "a\nb")).toEqual({ action: "skip", reason: "too_soon" });
    const d = term(40, "a\nb\nc");
    expect(d).toMatchObject({ action: "store", text: "b\nc" });
    expect(term(41, "a\nb\nc")).toEqual({ action: "skip", reason: "unchanged" });
    s.decide({ ts: t(42), app: "Slack", windowTitle: "x", url: null, text: "hi", titleOnly: false, cls: "chat" });
    expect(term(43, "a\nb\nc\nd")).toMatchObject({ action: "store", text: "d" });
  });
});
