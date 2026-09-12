import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { config, getPolicy, migrate, setPolicy } from "../index.js";

describe("policy repo", () => {
  beforeAll(() => migrate());
  it("returns defaults, persists, and exports engine rules", () => {
    const p = getPolicy();
    expect(p.retentionDays).toBe(30);
    setPolicy({ ...p, blockedApps: ["1Password"], blockedDomains: ["*.bank.com", "mail.google.com"] });
    expect(getPolicy().blockedDomains).toEqual(["*.bank.com", "mail.google.com"]);
    const rules = join(config.dataDir, "capture-rules.json");
    expect(existsSync(rules)).toBe(true);
    expect(JSON.parse(readFileSync(rules, "utf8"))).toEqual({ block_exe: ["1password"], block_domain: ["bank.com", "mail.google.com"] });
  });
});
