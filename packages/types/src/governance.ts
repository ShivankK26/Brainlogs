import { z } from "zod";
import { Actor, AgentId, Id, IsoTimestamp } from "./common.js";

export const NoteKind = z.enum(["note", "decision", "failed_attempt"]);
export type NoteKind = z.infer<typeof NoteKind>;

export const NoteStatus = z.enum(["proposed", "approved", "rejected"]);
export type NoteStatus = z.infer<typeof NoteStatus>;

/** An agent (or user) memory write. Agent writes are always `proposed` until the user approves. */
export const Note = z.object({
  id: Id,
  kind: NoteKind,
  text: z.string().min(1).max(4000),
  repo: z.string().nullable().default(null),
  entityIds: z.array(Id).default([]),
  author: Actor,
  status: NoteStatus,
  createdAt: IsoTimestamp,
});
export type Note = z.infer<typeof Note>;

export const AuditAction = z.enum(["query", "write", "purge", "export", "policy_change"]);
export type AuditAction = z.infer<typeof AuditAction>;

export const AuditResult = z.enum(["ok", "denied", "error"]);
export type AuditResult = z.infer<typeof AuditResult>;

/** One row in the audit log. Written for every query and every write, by anyone. */
export const AuditEntry = z.object({
  id: Id,
  ts: IsoTimestamp,
  actor: Actor,
  action: AuditAction,
  scope: z.string().max(512),
  result: AuditResult,
  detail: z.string().max(2000).default(""),
});
export type AuditEntry = z.infer<typeof AuditEntry>;

export const AgentPermissions = z.object({
  readTimeline: z.boolean(),
  readGraph: z.boolean(),
  write: z.boolean(),
  readSensitive: z.boolean(),
});
export type AgentPermissions = z.infer<typeof AgentPermissions>;

/** §10: what a freshly connected agent gets. */
export const DEFAULT_AGENT_PERMISSIONS: AgentPermissions = {
  readTimeline: true,
  readGraph: true,
  write: true,
  readSensitive: false,
};

/** Workspace policy. Enforced at capture and query time; agents cannot change it. */
export const Policy = z.object({
  blockedApps: z.array(z.string()).default([]),
  blockedDomains: z.array(z.string()).default([]),
  retentionDays: z.number().int().min(1).max(3650).default(30),
  agentPermissions: z.record(AgentId, AgentPermissions).default({}),
  cloudAskEnabled: z.boolean().default(false),
});
export type Policy = z.infer<typeof Policy>;

/** Password managers are blocked out of the box; everything else is opt-in. */
export const DEFAULT_POLICY: Policy = Policy.parse({
  blockedApps: ["1Password", "Bitwarden", "KeePassXC", "Keychain Access", "Dashlane", "LastPass"],
});
