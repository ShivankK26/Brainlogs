import type { AuditEntry, Commitment, Entity, Event, Note, Policy, Summary, Edge } from "@brainlog/types";
export type { AuditEntry, Commitment, Entity, Event, Note, Policy, Summary, Edge };

export type Highlight = { snippet: string; matches: Array<[number, number]> };
export type SearchHit = { event: Event; score: number; highlights: Highlight[]; entities: Entity[] };
export type SearchResult = { hits: SearchHit[]; total: number; usedVectors: boolean };
export type MomentResult = { focus: Event; entities: Entity[]; alsoOnScreen: Event[]; before: Event[]; after: Event[] };
export type TimelineDetailed = { events: Event[]; entities: Record<string, Entity[]> };
export type Pending = { notes: Note[]; edges: Edge[] };
export type Status = {
  user: { name: string; initials: string };
  dbSizeBytes: number;
  agents: string[];
  modelName: string;
  version: string;
  port: number;
  dataDir: string;
  vecReady: boolean;
  ollama: boolean;
  capture: { paused: boolean; pausedUntil: string | null };
  retentionDays: number;
  blockedApps: number;
  blockedDomains: number;
  counts: { events: number; entities: number; commitmentsOpen: number; notesPending: number; edgesPending: number; oldestEvent: string | null; newestEvent: string | null };
};
export type Pulse = {
  weekStart: string;
  weekEnd: string;
  focusedMs: number;
  sessions: number;
  contextSwitches: number;
  peakHours: [number, number] | null;
  agentQueries: number;
  writesToReview: number;
  commitments: { open: number; overdue: number; stalled: number; waiting: number };
  timeByProject: Array<{ name: string; ms: number; kind: string }>;
  summary: Summary | null;
  eventCount: number;
};
