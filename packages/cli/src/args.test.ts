import { describe, expect, it } from "vitest";
import { parseArgs, parseDuration } from "./args.js";

describe("parseArgs", () => {
  it("handles positionals, --k v, --k=v and boolean flags", () => {
    expect(parseArgs(["search", "pricing table", "--limit", "5", "--json", "--app=Slack"])).toEqual({
      positional: ["search", "pricing table"],
      flags: { limit: "5", json: true, app: "Slack" },
    });
  });
});

describe("parseDuration", () => {
  it("parses d/h/m", () => {
    expect(parseDuration("30d")).toBe(30 * 86_400_000);
    expect(parseDuration("15m")).toBe(900_000);
    expect(() => parseDuration("3w")).toThrow();
  });
});
