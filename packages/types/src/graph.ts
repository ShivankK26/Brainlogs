import { z } from "zod";
import { Actor, Id, IsoTimestamp } from "./common.js";

export const EntityKind = z.enum(["person", "project", "repo", "branch", "topic", "org", "doc"]);
export type EntityKind = z.infer<typeof EntityKind>;

/** Durable node in the entity graph. Survives retention purges. */
export const Entity = z.object({
  id: Id,
  kind: EntityKind,
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  firstSeen: IsoTimestamp,
  lastSeen: IsoTimestamp,
  mentionCount: z.number().int().nonnegative().default(0),
});
export type Entity = z.infer<typeof Entity>;

export const EdgeKind = z.enum(["mentions", "works_on", "owes", "owed_by", "decided", "blocked_by"]);
export type EdgeKind = z.infer<typeof EdgeKind>;

export const ProposalStatus = z.enum(["confirmed", "proposed", "rejected"]);
export type ProposalStatus = z.infer<typeof ProposalStatus>;

/**
 * A link to a source event. When the event has been purged by retention the
 * link is kept with `expired: true` and the timestamp it had, so provenance
 * never silently disappears.
 */
export const EvidenceRef = z.union([
  Id,
  z.object({ eventId: Id, expired: z.literal(true), tsSnapshot: IsoTimestamp }),
]);
export type EvidenceRef = z.infer<typeof EvidenceRef>;

/** Durable relation between entities. Always carries provenance. */
export const Edge = z.object({
  id: Id,
  fromEntity: Id,
  toEntity: Id.nullable().default(null),
  kind: EdgeKind,
  weight: z.number().min(0).default(1),
  evidenceEventIds: z.array(EvidenceRef).min(1),
  status: ProposalStatus,
  proposedBy: Actor,
  createdAt: IsoTimestamp,
});
export type Edge = z.infer<typeof Edge>;

export const CommitmentStatus = z.enum(["open", "waiting", "stalled", "overdue", "done", "dismissed"]);
export type CommitmentStatus = z.infer<typeof CommitmentStatus>;

/** A promise or request with a lifecycle. Specialised edge. */
export const Commitment = z.object({
  id: Id,
  text: z.string().min(1),
  fromParty: z.string().min(1),
  toParty: z.string().min(1),
  dueAt: IsoTimestamp.nullable().default(null),
  status: CommitmentStatus,
  evidenceEventIds: z.array(EvidenceRef).min(1),
  closedByEventId: Id.nullable().default(null),
  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
});
export type Commitment = z.infer<typeof Commitment>;

export const SummaryPeriod = z.enum(["day", "week"]);
export type SummaryPeriod = z.infer<typeof SummaryPeriod>;

export const SentenceProvenance = z.object({
  sentenceIdx: z.number().int().nonnegative(),
  eventIds: z.array(EvidenceRef),
});
export type SentenceProvenance = z.infer<typeof SentenceProvenance>;

/** Narrative summary. Every sentence links back to the events it was written from. */
export const Summary = z.object({
  id: Id,
  period: SummaryPeriod,
  start: IsoTimestamp,
  end: IsoTimestamp,
  markdown: z.string(),
  sentenceProvenance: z.array(SentenceProvenance).default([]),
});
export type Summary = z.infer<typeof Summary>;
