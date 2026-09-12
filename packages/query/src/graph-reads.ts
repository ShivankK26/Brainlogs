import { and, desc, eq, sql } from "drizzle-orm";
import { brainlogSchema as s, getDb } from "@brainlog/core";
import type { Commitment, CommitmentStatus, Event, Summary, SentenceProvenance } from "@brainlog/types";
import { visible, matchesFilters, type Perms } from "./filters.js";
import { edgesForEntity, entitiesForEvents, entityByIdOrName, entityEventIds, eventsBetween, eventsByIds, rowToCommitment } from "./store.js";
import type { EntityResult, SearchFilters } from "./types.js";

export function timeline(input: { from: string; to: string; filters?: SearchFilters; limit: number }, perms: Perms): Event[] {
  const events = eventsBetween(input.from, input.to, input.limit);
  const needEntities = Boolean(input.filters?.person || input.filters?.repo);
  const ents = needEntities ? entitiesForEvents(events.map((e) => e.id)) : new Map();
  return events.filter((e) => visible(e, perms) && matchesFilters(e, input.filters, (id) => ents.get(id) ?? []));
}

const STATUS_ORDER: CommitmentStatus[] = ["overdue", "open", "stalled", "waiting", "done", "dismissed"];

export function commitments(input: { status?: CommitmentStatus; party?: string }, _perms: Perms): Commitment[] {
  const db = getDb();
  const conds = [];
  if (input.status) conds.push(eq(s.commitments.status, input.status));
  if (input.party) {
    const p = `%${input.party.toLowerCase()}%`;
    conds.push(sql`(lower(${s.commitments.fromParty}) like ${p} or lower(${s.commitments.toParty}) like ${p})`);
  }
  const rows = (conds.length ? db.select().from(s.commitments).where(and(...conds)) : db.select().from(s.commitments)).all().map(rowToCommitment);
  return rows.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || (a.dueAt ?? "9").localeCompare(b.dueAt ?? "9") || b.updatedAt.localeCompare(a.updatedAt));
}

export function entity(input: { id?: string; name?: string }, perms: Perms): EntityResult {
  const ent = entityByIdOrName(input);
  if (!ent) return null;
  const ids = entityEventIds(ent.id, 50);
  const map = eventsByIds(ids);
  const recentEvents = ids.map((id) => map.get(id)).filter((e): e is Event => Boolean(e) && visible(e!, perms));
  const names = [ent.name, ...ent.aliases].map((n) => n.toLowerCase());
  const cmts = commitments({}, perms).filter((c) => names.includes(c.fromParty.toLowerCase()) || names.includes(c.toParty.toLowerCase()));
  return { entity: ent, edges: edgesForEntity(ent.id), recentEvents, commitments: cmts };
}

export function summary(input: { period: "day" | "week"; date: string }, _perms: Perms): Summary | null {
  const day = `${input.date}T00:00:00.000Z`;
  const r = getDb()
    .select()
    .from(s.summaries)
    .where(and(eq(s.summaries.period, input.period), sql`${s.summaries.start} <= ${day} and ${s.summaries.end} > ${day}`))
    .orderBy(desc(s.summaries.start))
    .get();
  if (!r) return null;
  return { id: r.id, period: r.period as Summary["period"], start: r.start, end: r.end, markdown: r.markdown, sentenceProvenance: JSON.parse(r.provenanceJson) as SentenceProvenance[] };
}
