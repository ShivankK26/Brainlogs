/** Persistence for the capture sampler: per-region last state and spool file cursors. */
import { lt } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { captureRegions, ingestCursors } from "../db/brainlog-schema.js";

export type RegionState = {
  key: string;
  app: string;
  lastHash: string;
  lastTs: string;
  lastText: string;
  sessionSeq: number;
};

export function loadRegionStates(): Map<string, RegionState> {
  const out = new Map<string, RegionState>();
  for (const r of getDb().select().from(captureRegions).all()) {
    out.set(r.key, { key: r.key, app: r.app, lastHash: r.lastHash, lastTs: r.lastTs, lastText: r.lastText, sessionSeq: r.sessionSeq });
  }
  return out;
}

export function saveRegionStates(states: Iterable<RegionState>): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.transaction((tx) => {
    for (const s of states) {
      tx.insert(captureRegions)
        .values({ key: s.key, app: s.app, lastHash: s.lastHash, lastTs: s.lastTs, lastText: s.lastText, sessionSeq: s.sessionSeq, updatedAt: now })
        .onConflictDoUpdate({
          target: captureRegions.key,
          set: { lastHash: s.lastHash, lastTs: s.lastTs, lastText: s.lastText, sessionSeq: s.sessionSeq, updatedAt: now },
        })
        .run();
    }
  });
}

/** Region memory is only useful for a few days; drop stale rows so raw text does not linger past retention. */
export function purgeRegionStates(olderThan: Date): number {
  return getDb().delete(captureRegions).where(lt(captureRegions.updatedAt, olderThan.toISOString())).run().changes;
}

export function loadIngestCursors(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of getDb().select().from(ingestCursors).all()) out[r.file] = r.offset;
  return out;
}

export function saveIngestCursors(cursors: Record<string, number>): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.transaction((tx) => {
    for (const [file, offset] of Object.entries(cursors)) {
      tx.insert(ingestCursors)
        .values({ file, offset, updatedAt: now })
        .onConflictDoUpdate({ target: ingestCursors.file, set: { offset, updatedAt: now } })
        .run();
    }
  });
}
