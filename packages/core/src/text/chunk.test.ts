import { describe, expect, it } from "vitest";
import { chunkText } from "./chunk.js";

describe("chunkText", () => {
  it("returns one chunk for short text", () => {
    expect(chunkText("hello\nworld")).toEqual(["hello\nworld"]);
  });
  it("keeps chunks under the limit and loses no characters", () => {
    const lines = Array.from({ length: 60 }, (_, i) => `line ${i} ${"x".repeat(30)}`);
    const text = lines.join("\n");
    const chunks = chunkText(text, 200);
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(200);
    expect(chunks.join("\n").replace(/\s+/g, "")).toBe(text.replace(/\s+/g, ""));
  });
  it("hard-wraps a single overlong line", () => {
    const chunks = chunkText("a".repeat(1500), 700);
    expect(chunks.map((c) => c.length)).toEqual([700, 700, 100]);
  });
  it("returns nothing for whitespace", () => {
    expect(chunkText("  \n\n ")).toEqual([]);
  });
});
