import { describe, expect, it } from "vitest";
import {
  AuditEntry,
  Commitment,
  DEFAULT_AGENT_PERMISSIONS,
  DEFAULT_POLICY,
  Edge,
  Entity,
  Event,
  Note,
  Policy,
  SpoolRecord,
} from "./index.js";

const ts = "2026-09-09T15:31:00.000Z";
const hash = "a".repeat(64);

describe("Event", () => {
  it("parses a minimal terminal event", () => {
    const e = Event.parse({
      id: "evt_1",
      ts,
      app: "Terminal",
      text: "Error: no such module: vec0",
      textHash: hash,
      sourceKind: "terminal",
      expiresAt: ts,
    });
    expect(e.sensitivity).toBe("none");
    expect(e.url).toBeNull();
  });
  it("rejects an unknown source kind", () => {
    expect(() => Event.parse({ id: "x", ts, app: "A", text: "", textHash: hash, sourceKind: "screenshot", expiresAt: ts })).toThrow();
  });
});

describe("graph", () => {
  it("requires evidence on edges and commitments", () => {
    expect(() =>
      Edge.parse({ id: "e", fromEntity: "a", kind: "mentions", evidenceEventIds: [], status: "confirmed", proposedBy: "system", createdAt: ts }),
    ).toThrow();
    expect(() =>
      Commitment.parse({ id: "c", text: "spec", fromParty: "you", toParty: "Priya", status: "open", evidenceEventIds: [], createdAt: ts, updatedAt: ts }),
    ).toThrow();
  });
  it("accepts expired evidence refs", () => {
    const e = Edge.parse({
      id: "e",
      fromEntity: "a",
      kind: "works_on",
      evidenceEventIds: [{ eventId: "gone", expired: true, tsSnapshot: ts }],
      status: "proposed",
      proposedBy: "claude-code",
      createdAt: ts,
    });
    expect(e.toEntity).toBeNull();
  });
  it("entity defaults", () => {
    const en = Entity.parse({ id: "p", kind: "person", name: "Priya", firstSeen: ts, lastSeen: ts });
    expect(en.aliases).toEqual([]);
    expect(en.mentionCount).toBe(0);
  });
});

describe("governance", () => {
  it("default policy is local-only and 30 days", () => {
    expect(DEFAULT_POLICY.retentionDays).toBe(30);
    expect(DEFAULT_POLICY.cloudAskEnabled).toBe(false);
    expect(DEFAULT_AGENT_PERMISSIONS.readSensitive).toBe(false);
  });
  it("rejects a malformed agent id in policy", () => {
    expect(() => Policy.parse({ agentPermissions: { "Bad Agent": DEFAULT_AGENT_PERMISSIONS } })).toThrow();
  });
  it("notes and audit entries validate", () => {
    const n = Note.parse({ id: "n", kind: "decision", text: "load vec0 before migrate", author: "claude-code", status: "proposed", createdAt: ts });
    expect(n.entityIds).toEqual([]);
    const a = AuditEntry.parse({ id: "a", ts, actor: "cursor", action: "query", scope: "sensitive=true", result: "denied" });
    expect(a.detail).toBe("");
  });
});

describe("SpoolRecord", () => {
  it("passes through unknown engine fields", () => {
    const r = SpoolRecord.parse({ ts, source: "ax", app: "Slack", text: "hi", future_field: 1 });
    expect((r as Record<string, unknown>).future_field).toBe(1);
  });
});
