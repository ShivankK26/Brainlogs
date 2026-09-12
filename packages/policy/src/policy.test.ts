import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY } from "@brainlog/types";
import { captureGate, classifySensitivity, isBlockedApp, isBlockedDomain } from "./index.js";

const policy = { ...DEFAULT_POLICY, blockedApps: ["1Password", "Banking"], blockedDomains: ["*.bank.com", "mail.google.com"] };

describe("blocklist", () => {
  it("matches apps by name, exe or bundle id, case-insensitively", () => {
    expect(isBlockedApp(policy, { app: "1password 8" })).toBe(true);
    expect(isBlockedApp(policy, { exe: "/Applications/1Password.app/Contents/MacOS/1Password" })).toBe(true);
    expect(isBlockedApp(policy, { app: "Slack" })).toBe(false);
  });
  it("matches domains with wildcard and suffix semantics", () => {
    expect(isBlockedDomain(policy, { domain: "online.bank.com" })).toBe(true);
    expect(isBlockedDomain(policy, { domain: "bank.com" })).toBe(false);
    expect(isBlockedDomain(policy, { url: "https://mail.google.com/mail/u/0/#inbox" })).toBe(true);
    expect(isBlockedDomain(policy, { url: "https://docs.google.com/x" })).toBe(false);
    expect(isBlockedDomain({ blockedDomains: ["github.com"] }, { domain: "gist.github.com" })).toBe(true);
  });
});

describe("classifySensitivity", () => {
  it("flags credentials", () => {
    expect(classifySensitivity({ text: "export OPENAI_API_KEY=sk-abcdef1234567890abcdef1234567890abcdef12" })).toBe("credential");
    expect(classifySensitivity({ text: "password: hunter2hunter2" })).toBe("credential");
    expect(classifySensitivity({ text: "-----BEGIN OPENSSH PRIVATE KEY-----" })).toBe("credential");
    expect(classifySensitivity({ text: "ghp_" + "a".repeat(36) })).toBe("credential");
    expect(classifySensitivity({ text: "token = eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U" })).toBe("credential");
  });
  it("flags financial and health", () => {
    expect(classifySensitivity({ text: "Account balance $12,340.55 IBAN DE89 3704 0044 0532 0130 00" })).toBe("financial");
    expect(classifySensitivity({ text: "card 4242 4242 4242 4242" })).toBe("financial");
    expect(classifySensitivity({ text: "Your lab results: HbA1c 5.4%", windowTitle: "MyChart" })).toBe("health");
  });
  it("tags DMs as third_party_private, channels as none", () => {
    expect(classifySensitivity({ text: "hi", app: "Slack", windowTitle: "DM · Priya", chat: true })).toBe("third_party_private");
    expect(classifySensitivity({ text: "hi", app: "WhatsApp", windowTitle: "Priya", chat: true })).toBe("third_party_private");
    expect(classifySensitivity({ text: "hi", app: "Slack", windowTitle: "#eng-platform", chat: true })).toBe("none");
  });
  it("credential beats everything else", () => {
    expect(classifySensitivity({ text: "IBAN DE89 3704 0044 0532 0130 00 password: correcthorse" })).toBe("credential");
  });
  it("ordinary text is none", () => {
    expect(classifySensitivity({ text: "Error: no such module: vec0 — migration 0004 failed" })).toBe("none");
  });
});

describe("captureGate", () => {
  it("drops blocked and credential, stores the rest with tags", () => {
    expect(captureGate(policy, { app: "1Password", text: "x" })).toEqual({ action: "drop", reason: "blocked_app" });
    expect(captureGate(policy, { app: "Chrome", url: "https://mail.google.com/", text: "Inbox" })).toEqual({ action: "drop", reason: "blocked_domain" });
    expect(captureGate(policy, { app: "Terminal", text: "AWS_SECRET_ACCESS_KEY=abcdefghijklmnop" })).toEqual({ action: "drop", reason: "credential" });
    expect(captureGate(policy, { app: "Firefox", text: "Account balance $1" })).toEqual({ action: "store", sensitivity: "financial" });
    expect(captureGate(policy, { app: "Terminal", text: "pnpm test" })).toEqual({ action: "store", sensitivity: "none" });
  });
});
