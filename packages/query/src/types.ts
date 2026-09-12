import { z } from "zod";
import type { Commitment, Entity, Event, Note, Summary, EvidenceRef, Edge } from "@brainlog/types";
import { CommitmentStatus, IsoTimestamp, NoteKind, SummaryPeriod, IsoDate } from "@brainlog/types";

export const SearchFilters = z.object({
  app: z.string().optional(),
  domain: z.string().optional(),
  person: z.string().optional(),
  repo: z.string().optional(),
  from: IsoTimestamp.optional(),
  to: IsoTimestamp.optional(),
});
export type SearchFilters = z.infer<typeof SearchFilters>;

export const SearchRequest = z.object({
  q: z.string().max(500),
  filters: SearchFilters.optional(),
  limit: z.number().int().min(1).max(200).default(20),
});
export type SearchRequest = z.input<typeof SearchRequest>;

export type Highlight = { snippet: string; matches: Array<[number, number]> };

export type SearchHit = { event: Event; score: number; highlights: Highlight[]; entities: Entity[] };
export type SearchResult = { hits: SearchHit[]; total: number; usedVectors: boolean };

export const MomentRequest = z.object({ eventId: z.string().min(1), windowMs: z.number().int().positive().default(15 * 60 * 1000) });
export type MomentRequest = z.input<typeof MomentRequest>;
export type MomentResult = { focus: Event; alsoOnScreen: Event[]; before: Event[]; after: Event[] };

export const TimelineRequest = z.object({
  from: IsoTimestamp,
  to: IsoTimestamp,
  filters: SearchFilters.optional(),
  limit: z.number().int().min(1).max(5000).default(1000),
});
export type TimelineRequest = z.input<typeof TimelineRequest>;

export const EntityRequest = z.union([z.object({ id: z.string().min(1) }), z.object({ name: z.string().min(1) })]);
export type EntityRequest = z.input<typeof EntityRequest>;
export type EntityResult = { entity: Entity; edges: Edge[]; recentEvents: Event[]; commitments: Commitment[] } | null;

export const CommitmentsRequest = z.object({ status: CommitmentStatus.optional(), party: z.string().optional() });
export type CommitmentsRequest = z.input<typeof CommitmentsRequest>;

export const SummaryRequest = z.object({ period: SummaryPeriod, date: IsoDate });
export type SummaryRequest = z.input<typeof SummaryRequest>;
export type SummaryResult = Summary | null;

export const AskRequest = z.object({ question: z.string().min(1).max(2000), scope: SearchFilters.optional() });
export type AskRequest = z.input<typeof AskRequest>;
export type AskResult = { answer: string; citations: string[]; model: string };

export const ProposeRequest = z.object({
  note: z.object({
    kind: NoteKind.default("note"),
    text: z.string().min(1).max(4000),
    repo: z.string().optional(),
    entityIds: z.array(z.string()).default([]),
  }),
});
export type ProposeRequest = z.input<typeof ProposeRequest>;

export const ReviewRequest = z.union([z.object({ noteId: z.string().min(1) }), z.object({ edgeId: z.string().min(1) })]);
export type ReviewRequest = z.input<typeof ReviewRequest>;
export type ReviewResult = { kind: "note"; note: Note } | { kind: "edge"; edge: Edge } | null;

export type { EvidenceRef };
