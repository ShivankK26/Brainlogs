/**
 * Weekly narrative with sentence-level provenance. Deterministic templates over the
 * week's sessions, entities and commitments; every sentence lists the event ids it was
 * written from. Entity names are wrapped in **bold** so the UI can mark them.
 */
import { createQueryApi, sessionize, weekBounds } from "@brainlog/query";
import type { Commitment, Event, Entity } from "@brainlog/types";
import { listCommitments, upsertSummary } from "./store.js";

type Sentence = { text: string; eventIds: string[] };

const hrs = (ms: number) => {
  const h = ms / 3_600_000;
  return h < 1 ? `${Math.max(1, Math.round(ms / 60_000))} minutes` : `${Math.round(h * 10) / 10} hours`;
};
const dayName = (ts: string) => new Date(ts).toLocaleDateString("en-US", { weekday: "long" });
const hhmm = (ts: string) => new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export async function buildWeeklySummary(date: string): Promise<{ markdown: string; provenance: Array<{ sentenceIdx: number; eventIds: string[] }>; start: string; end: string } | null> {
  const { start, end } = weekBounds(date);
  const api = createQueryApi({ actor: "system" });
  const { events, entities } = await api.timelineDetailed({ from: start, to: end, limit: 5000 });
  if (events.length === 0) return null;
  const sessions = sessionize(events);
  const sentences: Sentence[] = [];

  // 1. where the time went
  type Bucket = { ms: number; ids: string[]; apps: Map<string, number>; sessions: number };
  const byProject = new Map<string, Bucket>();
  for (const sess of sessions) {
    const ent = sess.eventIds.map((id) => (entities[id] ?? []).find((x: Entity) => x.kind === "repo" || x.kind === "project")).find(Boolean);
    const key = ent ? `****` : sess.app;
    const cur: Bucket = byProject.get(key) ?? { ms: 0, ids: [], apps: new Map<string, number>(), sessions: 0 };
    cur.ms += sess.end - sess.start;
    cur.ids.push(...sess.eventIds);
    cur.apps.set(sess.app, (cur.apps.get(sess.app) ?? 0) + (sess.end - sess.start));
    cur.sessions++;
    byProject.set(key, cur);
  }
  const top = [...byProject.entries()].sort((a, b) => b[1].ms - a[1].ms)[0];
  if (top) {
    const apps = [...top[1].apps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([a]) => a);
    sentences.push({ text: `Most of the week went into ${top[0]}: ${hrs(top[1].ms)} across ${top[1].sessions} session${top[1].sessions === 1 ? "" : "s"}, mostly in ${apps.join(" and ")}.`, eventIds: top[1].ids.slice(0, 40) });
  }

  // 2. branches opened and abandoned
  const branchEvents = events.filter((e) => (entities[e.id] ?? []).some((x: Entity) => x.kind === "branch"));
  const lastBranch = branchEvents[branchEvents.length - 1];
  if (lastBranch) {
    const branch = (entities[lastBranch.id] ?? []).find((x: Entity) => x.kind === "branch")!;
    const after = events.filter((e) => e.ts > lastBranch.ts && (entities[e.id] ?? []).some((x: Entity) => x.id === branch.id));
    const lastTouch = after[after.length - 1] ?? lastBranch;
    const errored = events.find((e) => e.ts >= lastBranch.ts && e.sourceKind === "terminal" && /\b(error|failed)\b/i.test(e.text));
    const idle = Date.parse(end) - Date.parse(lastTouch.ts) > 2 * 86_400_000 || lastTouch.ts === events[events.length - 1]!.ts;
    sentences.push({ text: `On ${dayName(lastBranch.ts)} you opened **${branch.name}**${idle ? ` and did not return after ${hhmm(lastTouch.ts)}` : ""}.`, eventIds: [lastBranch.id, lastTouch.id] });
    if (errored) sentences.push({ text: `The last thing on screen was a failing command: ${errored.text.split("\n").find((l) => /\b(error|failed)\b/i.test(l))?.slice(0, 90).trim()}.`, eventIds: [errored.id] });
  }

  // 3. commitments
  const cmts: Commitment[] = listCommitments().filter((c) => c.createdAt >= start && c.createdAt < end && c.status !== "dismissed");
  for (const c of cmts.slice(0, 3)) {
    const ids = c.evidenceEventIds.map((r) => (typeof r === "string" ? r : r.eventId));
    const other = c.fromParty === "you" ? c.toParty : c.fromParty;
    const due = c.dueAt ? ` by ${dayName(c.dueAt)}` : "";
    if (c.fromParty === "you" && c.status === "done") sentences.push({ text: `You promised **${other}** ${quote(c.text)}${due}; it closed on its own.`, eventIds: [...ids, ...(c.closedByEventId ? [c.closedByEventId] : [])] });
    else if (c.fromParty === "you") sentences.push({ text: `You told **${other}** ${quote(c.text)}${due}; ${c.status === "overdue" ? "that is now overdue" : c.status === "stalled" ? "nothing related has happened since" : "it is still open"}.`, eventIds: ids });
    else sentences.push({ text: `**${other}** asked you ${quote(c.text)}${due}; ${c.status === "done" ? "done" : "still open"}.`, eventIds: ids });
  }

  // 4. switching
  let switches = 0;
  const hours = new Array<number>(24).fill(0);
  const switchIds: string[] = [];
  for (let i = 1; i < events.length; i++) {
    if (events[i]!.app !== events[i - 1]!.app) {
      switches++;
      hours[new Date(events[i]!.ts).getHours()]!++;
      if (switchIds.length < 40) switchIds.push(events[i]!.id);
    }
  }
  if (switches > 0) {
    let best = 0;
    for (let h = 0; h < 23; h++) if (hours[h]! + hours[h + 1]! > hours[best]! + hours[best + 1]!) best = h;
    const pair = [...new Set(events.map((e) => e.app))].slice(0, 2);
    sentences.push({ text: `You switched between ${pair.join(" and ")} ${switches} time${switches === 1 ? "" : "s"}, concentrated between ${String(best).padStart(2, "0")}:00 and ${String(best + 2).padStart(2, "0")}:00.`, eventIds: switchIds });
  }

  if (sentences.length === 0) return null;
  const markdown = sentences.map((s) => s.text).join(" ");
  return { markdown, provenance: sentences.map((s, i) => ({ sentenceIdx: i, eventIds: [...new Set(s.eventIds)] })), start, end };
}

function quote(text: string): string {
  const t = text.replace(/^(you|i)\b:?\s*/i, "").replace(/[.!?]+$/, "");
  return `“${t.length > 70 ? `${t.slice(0, 67)}…` : t}”`;
}

export async function writeWeeklySummary(date: string): Promise<string | null> {
  const built = await buildWeeklySummary(date);
  if (!built) return null;
  return upsertSummary({ period: "week", start: built.start, end: built.end, markdown: built.markdown, provenance: built.provenance });
}

export type { Event };
