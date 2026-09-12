import { and, gte, lte, notInArray, sql } from "drizzle-orm";
import { brainlogSchema as s, getDb } from "@brainlog/core";
import type { Commitment, Entity, Event, Summary } from "@brainlog/types";
import { visible, type Perms } from "./filters.js";
import { regionOf } from "./moment.js";
import { commitments, summary } from "./graph-reads.js";
import { entitiesForEvents, eventsBetween } from "./store.js";

export type PulseResult = {
  weekStart: string;
  weekEnd: string;
  focusedMs: number;
  sessions: number;
  contextSwitches: number;
  peakHours: [number, number] | null;
  agentQueries: number;
  writesToReview: number;
  commitments: { open: number; overdue: number; stalled: number; waiting: number };
  timeByProject: Array<{ name: string; ms: number; kind: Entity["kind"] | "app" }>;
  summary: Summary | null;
  eventCount: number;
};

const SESSION_GAP_MS = 5 * 60_000;
const MIN_EVENT_MS = 30_000;

export function weekBounds(dateIso: string): { start: string; end: string } {
  const d = new Date(`${dateIso}T00:00:00.000Z`);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const start = new Date(d.getTime() - day * 86_400_000);
  const end = new Date(start.getTime() + 7 * 86_400_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Group consecutive events of the same region into sessions; each event contributes at least MIN_EVENT_MS. */
export function sessionize(events: Event[]): Array<{ region: string; app: string; start: number; end: number; eventIds: string[] }> {
  const out: Array<{ region: string; app: string; start: number; end: number; eventIds: string[] }> = [];
  let cur: (typeof out)[number] | null = null;
  for (const e of events) {
    const t = Date.parse(e.ts);
    const r = regionOf(e);
    if (cur && cur.region === r && t - cur.end <= SESSION_GAP_MS) {
      cur.end = Math.max(cur.end, t + MIN_EVENT_MS);
      cur.eventIds.push(e.id);
    } else {
      if (cur) out.push(cur);
      cur = { region: r, app: e.app, start: t, end: t + MIN_EVENT_MS, eventIds: [e.id] };
    }
  }
  if (cur) out.push(cur);
  return out;
}

export function pulse(input: { date: string }, perms: Perms): PulseResult {
  const { start, end } = weekBounds(input.date);
  const events = eventsBetween(start, end, 20_000).filter((e) => visible(e, perms));
  const sessions = sessionize(events);
  const focusedMs = sessions.reduce((n, x) => n + (x.end - x.start), 0);

  let contextSwitches = 0;
  const switchHours = new Array<number>(24).fill(0);
  for (let i = 1; i < events.length; i++) {
    if (events[i]!.app !== events[i - 1]!.app) {
      contextSwitches++;
      switchHours[new Date(events[i]!.ts).getUTCHours()]!++;
    }
  }
  let peakHours: [number, number] | null = null;
  if (contextSwitches > 0) {
    let best = 0;
    for (let h = 0; h < 23; h++) if (switchHours[h]! + switchHours[h + 1]! > switchHours[best]! + switchHours[best + 1]!) best = h;
    peakHours = [best, best + 2];
  }

  // time by project: prefer repo/project entities linked to the session's events, fall back to the app
  const ents = entitiesForEvents(events.map((e) => e.id));
  const byName = new Map<string, { ms: number; kind: Entity["kind"] | "app" }>();
  for (const sess of sessions) {
    const ms = sess.end - sess.start;
    let key: { name: string; kind: Entity["kind"] | "app" } | null = null;
    for (const id of sess.eventIds) {
      const ent = (ents.get(id) ?? []).find((x) => x.kind === "repo" || x.kind === "project");
      if (ent) {
        key = { name: ent.name, kind: ent.kind };
        break;
      }
    }
    key ??= { name: sess.app, kind: "app" };
    const cur = byName.get(key.name) ?? { ms: 0, kind: key.kind };
    cur.ms += ms;
    byName.set(key.name, cur);
  }
  const timeByProject = [...byName.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.ms - a.ms).slice(0, 6);

  const db = getDb();
  const agentQueries =
    db
      .select({ n: sql<number>`count(*)` })
      .from(s.auditEntries)
      .where(and(gte(s.auditEntries.ts, start), lte(s.auditEntries.ts, end), notInArray(s.auditEntries.actor, ["user", "system"])))
      .get()?.n ?? 0;
  const writesToReview =
    (db.select({ n: sql<number>`count(*)` }).from(s.notes).where(sql`${s.notes.status} = 'proposed'`).get()?.n ?? 0) +
    (db.select({ n: sql<number>`count(*)` }).from(s.edges).where(sql`${s.edges.status} = 'proposed'`).get()?.n ?? 0);

  const all: Commitment[] = commitments({}, perms);
  const count = (st: Commitment["status"]) => all.filter((c) => c.status === st).length;

  return {
    weekStart: start,
    weekEnd: end,
    focusedMs,
    sessions: sessions.length,
    contextSwitches,
    peakHours,
    agentQueries,
    writesToReview,
    commitments: { open: count("open") + count("overdue") + count("stalled") + count("waiting"), overdue: count("overdue"), stalled: count("stalled"), waiting: count("waiting") },
    timeByProject,
    summary: summary({ period: "week", date: input.date }, perms),
    eventCount: events.length,
  };
}
