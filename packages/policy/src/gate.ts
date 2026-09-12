import { DEFAULT_AGENT_PERMISSIONS, type Actor, type AgentPermissions, type AuditAction, type Policy } from "@brainlog/types";
import { updateAudit, writeAudit } from "@brainlog/core";

export type Permission = keyof AgentPermissions;

export type GateRequest = {
  action: AuditAction;
  /** Human-readable description of what is being touched, e.g. `search q="pricing table"`. Never contains captured text. */
  scope: string;
  /** Permissions the request needs. Empty means "anyone who can reach the API". */
  needs: Permission[];
};

export class PolicyDeniedError extends Error {
  readonly code = "POLICY_DENIED" as const;
  constructor(
    readonly actor: Actor,
    readonly missing: Permission[],
    readonly scope: string,
  ) {
    super(`Denied by policy: ${actor} lacks ${missing.join(", ")} for ${scope}`);
    this.name = "PolicyDeniedError";
  }
}

const ALL: AgentPermissions = { readTimeline: true, readGraph: true, write: true, readSensitive: true };

/** The user and the system can do everything. Agents get what the policy says, defaulting per §10. */
export function resolvePermissions(policy: Policy, actor: Actor): AgentPermissions {
  if (actor === "user" || actor === "system") return ALL;
  return policy.agentPermissions[actor] ?? DEFAULT_AGENT_PERMISSIONS;
}

export type GateResult = { permissions: AgentPermissions; auditId: string };

/**
 * Runs before every query/write. Writes an audit entry for both outcomes and
 * throws PolicyDeniedError (never partial data) when a permission is missing.
 */
export function gate(policy: Policy, actor: Actor, req: GateRequest): GateResult {
  const permissions = resolvePermissions(policy, actor);
  const missing = req.needs.filter((p) => !permissions[p]);
  if (missing.length > 0) {
    writeAudit({ actor, action: req.action, scope: req.scope, result: "denied", detail: `missing ${missing.join(",")}` });
    throw new PolicyDeniedError(actor, missing, req.scope);
  }
  const entry = writeAudit({ actor, action: req.action, scope: req.scope, result: "ok" });
  return { permissions, auditId: entry.id };
}

/** Attach the outcome (row counts, error name) to the audit row the gate opened. Detail must never include captured text. */
export function finishAudit(auditId: string, outcome: { result: "ok" | "error"; detail: string }): void {
  updateAudit(auditId, outcome);
}
