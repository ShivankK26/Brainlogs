import { z } from "zod";

/** ULID/UUID-ish opaque identifier. We do not constrain the alphabet so ids from upstream tables keep validating. */
export const Id = z.string().min(1).max(64);
export type Id = z.infer<typeof Id>;

/** ISO-8601 timestamp with timezone (what SQLite stores and what JS Date.toISOString emits). */
export const IsoTimestamp = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/, "expected ISO-8601 timestamp");
export type IsoTimestamp = z.infer<typeof IsoTimestamp>;

/** Calendar day, YYYY-MM-DD. */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
export type IsoDate = z.infer<typeof IsoDate>;

/** Hex-encoded sha256. */
export const Sha256Hex = z.string().regex(/^[a-f0-9]{64}$/, "expected sha256 hex");
export type Sha256Hex = z.infer<typeof Sha256Hex>;

/** Identifier of an MCP agent (`claude-code`, `cursor`, `codex`, or custom). */
export const AgentId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, "agent ids are lowercase, dotted or dashed");
export type AgentId = z.infer<typeof AgentId>;

/** Who did a thing: the user, the system, or a named agent. */
export const Actor = z.union([z.literal("user"), z.literal("system"), AgentId]);
export type Actor = z.infer<typeof Actor>;
