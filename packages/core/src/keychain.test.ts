import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { keychainBackend, keychainDelete, keychainGet, keychainSet } from "./keychain.js";

const dir = mkdtempSync(join(tmpdir(), "brainlog-keychain-"));

describe("keychain", () => {
  const guard = process.env.BRAINLOG_NO_KEYCHAIN;
  beforeAll(() => {
    delete process.env.BRAINLOG_NO_KEYCHAIN;
    process.env.BRAINLOG_USE_KEYCHAIN = "1";
  });
  afterAll(() => {
    keychainDelete(dir);
    if (guard !== undefined) process.env.BRAINLOG_NO_KEYCHAIN = guard;
    delete process.env.BRAINLOG_USE_KEYCHAIN;
  });
  it("round-trips a key through the OS backend when one exists", () => {
    const backend = keychainBackend();
    if (backend === "none") {
      expect(keychainSet(dir, "x")).toBe(false);
      expect(keychainGet(dir)).toBeNull();
      return;
    }
    const key = `test-${Date.now()}`;
    expect(keychainSet(dir, key)).toBe(true);
    expect(keychainGet(dir)).toBe(key);
    keychainDelete(dir);
    expect(keychainGet(dir)).toBeNull();
  });
});
