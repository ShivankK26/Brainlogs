/**
 * Event repository: the only place that writes `events` and `chunks`.
 * Capture goes through here; query/enrich/graph read via their own modules.
 */
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { Event, EvidenceRef } from "@brainlog/types";
import { getDb, getSqlite } from "../db/client.js";
import { chunks, commitments, edges, events } from "../db/brainlog-schema.js";
import { sha256 } from "../crypto.js";
import { newId } from "../jobs.js";
import { log } from "../log.js";

export type EventRow = typeof events.$inferSelect;

export function rowToEvent(r: EventRow): Event {
  return {
    id: r.id,
    ts: r.ts,
    app: r.app,
    bundleId: r.bundleId,
    windowTitle: r.windowTitle,
    url: r.url,
    domain: r.domain,
    text: r.text,
    textHash: r.textHash,
    sourceKind: r.sourceKind as Event["sourceKind"],
    sensitivity: r.sensitivity as Event["sensitivity"],
    expiresAt: r.expiresAt,
  };
}

/** Insert an event and its chunks in one transaction. Chunk hashes are content hashes so identical text embeds once. */
export function insertEvent(event: Event, chunkTexts: string[]): void {
  const db = getDb();
  db.transaction((tx) => {
    tx.insert(events)
      .values({
        id: event.id,
        ts: event.ts,
        app: event.app,
        bundleId: event.bundleId,
        windowTitle: event.windowTitle,
        url: event.url,
        domain: event.domain,
        text: event.text,
        textHash: event.textHash,
        sourceKind: event.sourceKind,
        sensitivity: event.sensitivity,
        expiresAt: event.expiresAt,
      })
      .run();
    chunkTexts.forEach((text, idx) => {
      tx.insert(chunks).values({ id: newId(), eventId: event.id, idx, text, hash: sha256(text) }).run();
    });
  });
}

export function getEventById(id: string): Event | null {
  const r = getDb().select().from(events).where(eq(events.id, id)).get();
  return r ? rowToEvent(r) : null;
}

export function getEventsByIds(ids: string[]): Event[] {
  if (ids.length === 0) return [];
  return getDb().select().from(events).where(inArray(events.id, ids)).all().map(rowToEvent);
}

export function countEvents(): number {
  const r = getDb().select({ n: sql<number>`count(*)` }).from(events).get();
  return r?.n ?? 0;
}

export function hasTextHash(textHash: string): boolean {
  return Boolean(getDb().select({ id: events.id }).from(events).where(eq(events.textHash, textHash)).get());
}

export type PurgeResult = { events: number; chunks: number; vectors: number; relinked: number };

function relinkEvidence(expired: Map<string, string>): number {
  if (expired.size === 0) return 0;
  const db = getDb();
  let relinked = 0;
  const rewrite = (json: string): string | null => {
    let refs: EvidenceRef[];
    try {
      refs = JSON.parse(json) as EvidenceRef[];
    } catch {
      return null;
    }
    let changed = false;
    const next = refs.map((ref) => {
      if (typeof ref === "string" && expired.has(ref)) {
        changed = true;
        return { eventId: ref, expired: true as const, tsSnapshot: expired.get(ref)! };
      }
      return ref;
    });
    return changed ? JSON.stringify(next) : null;
  };
  for (const row of db.select({ id: edges.id, evidenceJson: edges.evidenceJson }).from(edges).all()) {
    const next = rewrite(row.evidenceJson);
    if (next) {
      db.update(edges).set({ evidenceJson: next }).where(eq(edges.id, row.id)).run();
      relinked++;
    }
  }
  for (const row of db.select({ id: commitments.id, evidenceJson: commitments.evidenceJson }).from(commitments).all()) {
    const next = rewrite(row.evidenceJson);
    if (next) {
      db.update(commitments).set({ evidenceJson: next }).where(eq(commitments.id, row.id)).run();
      relinked++;
    }
  }
  return relinked;
}

/**
 * Retention purge. Idempotent: a second run with the same `now` deletes nothing.
 * Cascades events → chunks (FK) → chunks_fts (trigger) → chunk_vec (explicit, vec0 has no FKs),
 * then rewrites evidence links on edges/commitments to `{ eventId, expired: true, tsSnapshot }`.
 */
export function purgeExpiredEvents(now = new Date()): PurgeResult {
  const db = getDb();
  const sqlite = getSqlite();
  const cutoff = now.toISOString();
  const expiring = db.select({ id: events.id, ts: events.ts }).from(events).where(lt(events.expiresAt, cutoff)).all();
  if (expiring.length === 0) return { events: 0, chunks: 0, vectors: 0, relinked: 0 };
  const ids = expiring.map((e) => e.id);
  const expiredTs = new Map(expiring.map((e) => [e.id, e.ts]));
  let chunkCount = 0;
  let vectors = 0;
  const BATCH = 500;
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    const chunkIds = db.select({ id: chunks.id }).from(chunks).where(inArray(chunks.eventId, slice)).all().map((c) => c.id);
    chunkCount += chunkIds.length;
    for (let j = 0; j < chunkIds.length; j += BATCH) {
      const cs = chunkIds.slice(j, j + BATCH);
      const placeholders = cs.map(() => "?").join(",");
      vectors += sqlite.prepare(`DELETE FROM chunk_vec WHERE chunk_id IN (${placeholders})`).run(...cs).changes;
    }
    db.delete(events).where(and(inArray(events.id, slice), lt(events.expiresAt, cutoff))).run();
  }
  const relinked = relinkEvidence(expiredTs);
  log.info("Retention purge", { events: ids.length, chunks: chunkCount, vectors, relinked });
  return { events: ids.length, chunks: chunkCount, vectors, relinked };
}

/** Delete one event and cascade. Used by the UI's "forget this" action. */
export function deleteEvent(id: string): boolean {
  const db = getDb();
  const sqlite = getSqlite();
  const row = db.select({ id: events.id, ts: events.ts }).from(events).where(eq(events.id, id)).get();
  if (!row) return false;
  const chunkIds = db.select({ id: chunks.id }).from(chunks).where(eq(chunks.eventId, id)).all().map((c) => c.id);
  for (const c of chunkIds) sqlite.prepare("DELETE FROM chunk_vec WHERE chunk_id = ?").run(c);
  db.delete(events).where(eq(events.id, id)).run();
  relinkEvidence(new Map([[id, row.ts]]));
  return true;
}
