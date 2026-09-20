import type { AuditEntry, Commitment, Entity, Event, Note, Policy, Summary, Edge } from "@brainlog/types";
export type { AuditEntry, Commitment, Entity, Event, Note, Policy, Summary, Edge };

export type Highlight = { snippet: string; matches: Array<[number, number]> };
export type SearchHit = { event: Event; score: number; highlights: Highlight[]; entities: Entity[] };
export type SearchResult = { hits: SearchHit[]; total: number; usedVectors: boolean };
export type MomentResult = { focus: Event; entities: Entity[]; alsoOnScreen: Event[]; before: Event[]; after: Event[] };
export type TimelineDetailed = { events: Event[]; entities: Record<string, Entity[]> };
export type Facets = { days: number; apps: Array<{ name: string; count: number }>; domains: Array<{ name: string; count: number }> };
/** Server-side filters accepted by /search and /timeline. */
export type QueryFilters = { app?: string; domain?: string; person?: string; repo?: string; from?: string; to?: string };
export type MomentKind = "message" | "meeting" | "doc" | "code" | "mail" | "page" | "app";
export type AskMoment = { eventId: string; eventIds: string[]; start: string; end: string; count: number; title: string; app: string; domain: string | null; kind: MomentKind; sensitivity: Event["sensitivity"]; snippet?: string; matches: { person: boolean; topic: boolean } };
export type Structured = { intent: "when" | "contact" | "duration" | "day" | "who" | "find"; verdict: string; detail?: string; facts: Array<{ label: string; value: string; eventId?: string }>; moments: AskMoment[]; scope: { from?: string; to?: string; label?: string } };
export type AskResult = { answer: string; citations: string[]; model: string; via: "cloud" | "local" | "none"; withheld?: number; structured: Structured };
export type PlaceKind = "doc" | "person" | "repo" | "site" | "app" | "call";
export type Place = { key: string; kind: PlaceKind; label: string; where: string };
export type PlaceSummary = Place & { visits: number; lastSeen: string; totalMs: number; week: number[]; eventId: string };
export type Change = { added: string[]; removed: string[]; summary: string | null };
export type Visit = { start: string; end: string; ms: number; eventIds: string[]; text: string; app: string };
export type PlaceFact = { kind: "decision" | "question" | "promise"; text: string; ts: string; eventId: string };
export type PlaceHistory = { place: Place; visits: Array<Visit & { change: Change | null }>; facts: PlaceFact[] };
export type Recall = { place: Place; visits: number; firstSeen: string | null; lastSeen: string | null; totalMs: number; previousVisit: Visit | null; change: Change | null; facts: PlaceFact[]; people: string[]; eventIds: string[] };
export type PullState = { model: string; status: string; completed: number; total: number; done: boolean; error: string | null; startedAt: string };
export type ModelStatus = { installed: boolean; running: boolean; models: string[]; askModel: string | null; recommended: string; recommendedSize: string; pull: PullState | null; downloadUrl: string };
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
  capture: {
    paused: boolean;
    pausedUntil: string | null;
    /** null: the desktop engine has never reported (CLI-only install or app not running). */
    engineRunning: boolean | null;
    /** false: macOS Accessibility not granted, so window text cannot be read. null: unknown. */
    accessibility: boolean | null;
    lastTextAt: string | null;
    engineVersion: string | null;
  };
  cloudAsk: { enabled: boolean; hasKey: boolean; keySource: "env" | "file" | null; keyHint: string | null; model: string };
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
  days: Array<{ date: string; focusedMs: number; sessions: number; firstTs: string | null; lastTs: string | null }>;
  previous: { focusedMs: number; sessions: number; contextSwitches: number; activeDays: number };
  topDomains: Array<{ name: string; ms: number }>;
  people: Array<{ name: string; ms: number; lastTs: string; count: number }>;
  longestSession: { app: string; title: string; ms: number; start: string; eventId: string } | null;
  activeDays: number;
};
