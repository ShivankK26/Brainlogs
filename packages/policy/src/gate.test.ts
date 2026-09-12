import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_POLICY } from "@brainlog/types";
import { listAudit, migrate } from "@brainlog/core";
import { PolicyDeniedError, gate, resolvePermissions } from "./gate.js";

describe("gate", () => {
  beforeAll(() => migrate());
  it("user and system have every permission; unknown agents get the §10 defaults", () => {
    expect(resolvePermissions(DEFAULT_POLICY, "user").readSensitive).toBe(true);
    expect(resolvePermissions(DEFAULT_POLICY, "codex")).toEqual({ readTimeline: true, readGraph: true, write: true, readSensitive: false });
  });
  it("allows, denies with a typed error, and audits both", () => {
    const ok = gate(DEFAULT_POLICY, "claude-code", { action: "query", scope: "search", needs: ["readTimeline"] });
    expect(ok.permissions.readTimeline).toBe(true);
    expect(() => gate(DEFAULT_POLICY, "cursor", { action: "query", scope: "timeline sensitive=true", needs: ["readTimeline", "readSensitive"] })).toThrow(
      PolicyDeniedError,
    );
    const audit = listAudit({ limit: 10 });
    expect(audit.map((a) => [a.actor, a.result])).toEqual([
      ["cursor", "denied"],
      ["claude-code", "ok"],
    ]);
    expect(audit[0]?.detail).toBe("missing readSensitive");
  });
  it("policy can revoke write for an agent", () => {
    const policy = { ...DEFAULT_POLICY, agentPermissions: { cursor: { readTimeline: true, readGraph: true, write: false, readSensitive: false } } };
    expect(() => gate(policy, "cursor", { action: "write", scope: "remember", needs: ["write"] })).toThrow(/lacks write/);
  });
});
