/** Thin read helpers over core tables used by several query modules. */
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Commitment, Edge, Entity, EvidenceRef, Event, Note } from "@brainlog/types";
import { brainlogSchema as s, getDb, rowToEvent } from "@brainlog/core";

export function rowToEntity(r: typeof s.entities.$inferSelect): Entity {
  return { id: r.id, kind: r.kind as Entity["kind"], name: r.name, aliases: JSON.parse(r.aliasesJson) as string[], firstSeen: r.firstSeen, lastSeen: r.lastSeen, mentionCount: r.mentionCount };
}

export function rowToEdge(r: typeof s.edges.$inferSelect): Edge {
  return {
    id: r.id,
    fromEntity: r.fromEntity,
    toEntity: r.toEntity,
    kind: r.kind as Edge["kind"],
    weight: r.weight,
    evidenceEventIds: JSON.parse(r.evidenceJson) as EvidenceRef[],
    status: r.status as Edge["status"],
    proposedBy: r.proposedBy,
    createdAt: r.createdAt,
  };
}

export function rowToCommitment(r: typeof s.commitments.$inferSelect): Commitment {
  return {
    id: r.id,
    text: r.text,
    fromParty: r.fromParty,
    toParty: r.toParty,
    dueAt: r.dueAt,
    status: r.status as Commitment["status"],
    evidenceEventIds: JSON.parse(r.evidenceJson) as EvidenceRef[],
    closedByEventId: r.closedByEventId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function rowToNote(r: typeof s.notes.$inferSelect): Note {
  return { id: r.id, kind: r.kind as Note["kind"], text: r.text, repo: r.repo, entityIds: JSON.parse(r.entityIdsJson) as string[], author: r.author, status: r.status as Note["status"], createdAt: r.createdAt };
}

export function eventsByIds(ids: string[]): Map<string, Event> {
  const out = new Map<string, Event>();
  for (let i = 0; i < ids.length; i += 500) {
    const slice = ids.slice(i, i + 500);
    if (slice.length === 0) continue;
    for (const r of getDb().select().from(s.events).where(inArray(s.events.id, slice)).all()) out.set(r.id, rowToEvent(r));
  }
  return out;
}

/**
 * Events in [from, to], ascending. When the window holds more than `limit`, the *newest* ones win:
 * a busy week must never hide today behind a cap that keeps the oldest rows.
 */
export function eventsBetween(from: string, to: string, limit = 1000): Event[] {
  return getDb()
    .select()
    .from(s.events)
    .where(and(gte(s.events.ts, from), lte(s.events.ts, to)))
    .orderBy(desc(s.events.ts))
    .limit(limit)
    .all()
    .reverse()
    .map(rowToEvent);
}

export function recentEvents(limit = 50): Event[] {
  return getDb().select().from(s.events).orderBy(desc(s.events.ts)).limit(limit).all().map(rowToEvent);
}

/** Entities linked to each event id (single query, grouped). */
export function entitiesForEvents(eventIds: string[]): Map<string, Entity[]> {
  const out = new Map<string, Entity[]>();
  if (eventIds.length === 0) return out;
  const rows = getDb()
    .select({ eventId: s.eventEntities.eventId, entity: s.entities })
    .from(s.eventEntities)
    .innerJoin(s.entities, eq(s.entities.id, s.eventEntities.entityId))
    .where(inArray(s.eventEntities.eventId, eventIds))
    .all();
  for (const r of rows) {
    const list = out.get(r.eventId) ?? [];
    list.push(rowToEntity(r.entity));
    out.set(r.eventId, list);
  }
  return out;
}

export function entityByIdOrName(q: { id?: string; name?: string }): Entity | null {
  const db = getDb();
  if (q.id) {
    const r = db.select().from(s.entities).where(eq(s.entities.id, q.id)).get();
    return r ? rowToEntity(r) : null;
  }
  const norm = (q.name ?? "").trim().toLowerCase();
  if (!norm) return null;
  const r =
    db.select().from(s.entities).where(eq(s.entities.nameNorm, norm)).orderBy(desc(s.entities.mentionCount)).get() ??
    db
      .select()
      .from(s.entities)
      .where(sql`lower(${s.entities.aliasesJson}) like ${"%\"" + norm.replace(/[%_]/g, "") + "\"%"}`)
      .orderBy(desc(s.entities.mentionCount))
      .get();
  return r ? rowToEntity(r) : null;
}

export function entityEventIds(entityId: string, limit = 50): string[] {
  return getDb()
    .select({ eventId: s.eventEntities.eventId, ts: s.events.ts })
    .from(s.eventEntities)
    .innerJoin(s.events, eq(s.events.id, s.eventEntities.eventId))
    .where(eq(s.eventEntities.entityId, entityId))
    .orderBy(desc(s.events.ts))
    .limit(limit)
    .all()
    .map((r) => r.eventId);
}

export function edgesForEntity(entityId: string): Edge[] {
  return getDb()
    .select()
    .from(s.edges)
    .where(sql`${s.edges.fromEntity} = ${entityId} or ${s.edges.toEntity} = ${entityId}`)
    .orderBy(desc(s.edges.weight))
    .all()
    .map(rowToEdge);
}

export function topEntities(limit = 20): Entity[] {
  return getDb().select().from(s.entities).orderBy(desc(s.entities.mentionCount), desc(s.entities.lastSeen)).limit(limit).all().map(rowToEntity);
}

export function stats(): { events: number; entities: number; commitmentsOpen: number; notesPending: number; edgesPending: number; oldestEvent: string | null; newestEvent: string | null } {
  const db = getDb();
  const n = (q: { get: () => { n: number } | undefined }) => q.get()?.n ?? 0;
  return {
    events: n(db.select({ n: sql<number>`count(*)` }).from(s.events)),
    entities: n(db.select({ n: sql<number>`count(*)` }).from(s.entities)),
    commitmentsOpen: n(db.select({ n: sql<number>`count(*)` }).from(s.commitments).where(inArray(s.commitments.status, ["open", "waiting", "stalled", "overdue"]))),
    notesPending: n(db.select({ n: sql<number>`count(*)` }).from(s.notes).where(eq(s.notes.status, "proposed"))),
    edgesPending: n(db.select({ n: sql<number>`count(*)` }).from(s.edges).where(eq(s.edges.status, "proposed"))),
    oldestEvent: db.select({ ts: sql<string | null>`min(${s.events.ts})` }).from(s.events).get()?.ts ?? null,
    newestEvent: db.select({ ts: sql<string | null>`max(${s.events.ts})` }).from(s.events).get()?.ts ?? null,
  };
}
