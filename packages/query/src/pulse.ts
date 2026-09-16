import { and, gte, lte, notInArray, sql } from "drizzle-orm";
import { brainlogSchema as s, getDb } from "@brainlog/core";
import type { Commitment, Entity, Event, Summary } from "@brainlog/types";
import { visible, type Perms } from "./filters.js";
import { regionOf } from "./moment.js";
import { commitments, summary } from "./graph-reads.js";
import { entitiesForEvents, eventsBetween } from "./store.js";
import { kindOf, looksLikePersonName, normApp } from "./plan.js";

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
  /** One entry per day of the week, Monday first; `focusedMs` 0 on days with nothing captured. */
  days: Array<{ date: string; focusedMs: number; sessions: number; firstTs: string | null; lastTs: string | null }>;
  /** Same measures for the previous week, for deltas. */
  previous: { focusedMs: number; sessions: number; contextSwitches: number; activeDays: number };
  topDomains: Array<{ name: string; ms: number }>;
  /** People you exchanged messages with (person entities linked to chat/mail moments). */
  people: Array<{ name: string; ms: number; lastTs: string; count: number }>;
  longestSession: { app: string; title: string; ms: number; start: string; eventId: string } | null;
  activeDays: number;
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

/**
 * Wall-clock time covered by a set of intervals. Sessions from different windows overlap (a chat
 * and a browser tab on screen at once; history rows next to window captures), so summing them
 * overstates the day. The union is what "active time" should mean.
 */
export function unionMs(intervals: Array<{ start: number; end: number }>): number {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  let total = 0;
  let cur: { start: number; end: number } | null = null;
  for (const iv of sorted) {
    if (cur && iv.start <= cur.end) cur.end = Math.max(cur.end, iv.end);
    else {
      if (cur) total += cur.end - cur.start;
      cur = { start: iv.start, end: iv.end };
    }
  }
  if (cur) total += cur.end - cur.start;
  return total;
}

/** Active time, sessions and app switches for a set of events (used for this week and the previous one). */
function measures(events: Event[]) {
  const sessions = sessionize(events);
  const focusedMs = unionMs(sessions);
  let contextSwitches = 0;
  const switchHours = new Array<number>(24).fill(0);
  for (let i = 1; i < events.length; i++) {
    if (normApp(events[i]!.app) !== normApp(events[i - 1]!.app)) {
      contextSwitches++;
      switchHours[new Date(events[i]!.ts).getHours()]!++;
    }
  }
  const activeDays = new Set(events.map((e) => new Date(e.ts).toDateString())).size;
  return { sessions, focusedMs, contextSwitches, switchHours, activeDays };
}

export function pulse(input: { date: string }, perms: Perms): PulseResult {
  const { start, end } = weekBounds(input.date);
  const events = eventsBetween(start, end, 20_000).filter((e) => visible(e, perms));
  const { sessions, focusedMs, contextSwitches, switchHours, activeDays } = measures(events);
  const prevStart = new Date(Date.parse(start) - 7 * 86_400_000).toISOString();
  const prevM = measures(eventsBetween(prevStart, start, 20_000).filter((e) => visible(e, perms)));
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
    key ??= { name: normApp(sess.app), kind: "app" };
    const cur = byName.get(key.name) ?? { ms: 0, kind: key.kind };
    cur.ms += ms;
    byName.set(key.name, cur);
  }
  const timeByProject = [...byName.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.ms - a.ms).slice(0, 8);

  // per-day rhythm (local days, Monday first)
  const byId = new Map(events.map((e) => [e.id, e]));
  const dayKeys: string[] = [];
  for (let i = 0; i < 7; i++) dayKeys.push(new Date(Date.parse(start) + i * 86_400_000).toISOString().slice(0, 10));
  const dayAgg = new Map(dayKeys.map((d) => [d, { focusedMs: 0, sessions: 0, firstTs: null as string | null, lastTs: null as string | null }]));
  const localDay = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const perDay = new Map<string, Array<{ start: number; end: number }>>();
  for (const sess of sessions) {
    const k = localDay(sess.start);
    const a = dayAgg.get(k);
    if (!a) continue;
    perDay.set(k, [...(perDay.get(k) ?? []), { start: sess.start, end: sess.end }]);
    a.sessions += 1;
    const first = byId.get(sess.eventIds[0]!)?.ts ?? null;
    const last = byId.get(sess.eventIds[sess.eventIds.length - 1]!)?.ts ?? null;
    if (first && (!a.firstTs || first < a.firstTs)) a.firstTs = first;
    if (last && (!a.lastTs || last > a.lastTs)) a.lastTs = last;
  }
  for (const [k, ivs] of perDay) dayAgg.get(k)!.focusedMs = unionMs(ivs);
  const days = dayKeys.map((date) => ({ date, ...dayAgg.get(date)! }));

  // top domains and the people you actually exchanged messages with
  const domainMs = new Map<string, number>();
  const peopleAgg = new Map<string, { ms: number; lastTs: string; count: number }>();
  for (const sess of sessions) {
    const ms = sess.end - sess.start;
    const first = byId.get(sess.eventIds[0]!);
    if (first?.domain) domainMs.set(first.domain, (domainMs.get(first.domain) ?? 0) + ms);
    if (first && (kindOf(first) === "message" || kindOf(first) === "mail")) {
      const names = new Set<string>();
      for (const id of sess.eventIds) for (const ent of ents.get(id) ?? []) if (ent.kind === "person" && looksLikePersonName(ent.name)) names.add(ent.name);
      for (const name of names) {
        const cur = peopleAgg.get(name) ?? { ms: 0, lastTs: first.ts, count: 0 };
        cur.ms += ms;
        cur.count += 1;
        if (first.ts > cur.lastTs) cur.lastTs = first.ts;
        peopleAgg.set(name, cur);
      }
    }
  }
  const topDomains = [...domainMs.entries()].map(([name, ms]) => ({ name, ms })).sort((a, b) => b.ms - a.ms).slice(0, 6);
  const people = [...peopleAgg.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.ms - a.ms).slice(0, 6);
  const longest = sessions.reduce<(typeof sessions)[number] | null>((best, s2) => (!best || s2.end - s2.start > best.end - best.start ? s2 : best), null);
  const longestFirst = longest ? byId.get(longest.eventIds[0]!) : undefined;
  const longestSession = longest && longestFirst ? { app: normApp(longest.app), title: longestFirst.windowTitle, ms: longest.end - longest.start, start: longestFirst.ts, eventId: longestFirst.id } : null;

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
    days,
    previous: { focusedMs: prevM.focusedMs, sessions: prevM.sessions.length, contextSwitches: prevM.contextSwitches, activeDays: prevM.activeDays },
    topDomains,
    people,
    longestSession,
    activeDays,
  };
}
