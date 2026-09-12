import { beforeAll, describe, expect, it } from "vitest";
import { sha256 } from "../crypto.js";
import { countEvents, getDb, getSqlite, insertEvent, migrate, purgeExpiredEvents } from "../index.js";
import { commitments, edges, entities } from "../db/brainlog-schema.js";
import type { Event } from "@brainlog/types";

const mk = (id: string, ts: string, expiresAt: string, text = `text ${id}`): Event => ({
  id,
  ts,
  app: "Terminal",
  bundleId: null,
  windowTitle: "zsh",
  url: null,
  domain: null,
  text,
  textHash: sha256(text),
  sourceKind: "terminal",
  sensitivity: "none",
  expiresAt,
});

describe("events repo", () => {
  beforeAll(() => migrate());

  it("inserts events with chunks, indexes FTS, and purges with cascade + relink", () => {
    const old = mk("old", "2026-08-01T10:00:00.000Z", "2026-08-31T10:00:00.000Z", "vec0 module missing in migration");
    const fresh = mk("fresh", "2026-09-09T15:31:00.000Z", "2026-10-09T15:31:00.000Z", "pnpm test passed");
    insertEvent(old, ["vec0 module missing", "in migration"]);
    insertEvent(fresh, ["pnpm test passed"]);
    const sqlite = getSqlite();
    // fake vectors for both chunks of `old`
    const chunkIds = (sqlite.prepare("select id from chunks where event_id = 'old'").all() as Array<{ id: string }>).map((r) => r.id);
    const vec = Buffer.alloc(384);
    for (const c of chunkIds) sqlite.prepare("insert into chunk_vec(chunk_id, embedding) values (?, vec_int8(?))").run(c, vec);
    expect(sqlite.prepare("select count(*) n from chunks_fts where chunks_fts match 'vec0'").get()).toEqual({ n: 1 });

    const db = getDb();
    db.insert(entities).values({ id: "ent", kind: "repo", name: "brainlog", nameNorm: "brainlog", firstSeen: old.ts, lastSeen: old.ts }).run();
    db.insert(edges)
      .values({ id: "edge", fromEntity: "ent", kind: "mentions", evidenceJson: JSON.stringify(["old", "fresh"]), status: "confirmed", proposedBy: "system", createdAt: old.ts })
      .run();
    db.insert(commitments)
      .values({ id: "c", text: "fix", fromParty: "you", toParty: "you", status: "open", evidenceJson: JSON.stringify(["old"]), createdAt: old.ts, updatedAt: old.ts })
      .run();

    const now = new Date("2026-09-12T00:00:00.000Z");
    const r1 = purgeExpiredEvents(now);
    expect(r1).toEqual({ events: 1, chunks: 2, vectors: 2, relinked: 2 });
    expect(countEvents()).toBe(1);
    expect(sqlite.prepare("select count(*) n from chunks").get()).toEqual({ n: 1 });
    expect(sqlite.prepare("select count(*) n from chunk_vec").get()).toEqual({ n: 0 });
    expect(sqlite.prepare("select count(*) n from chunks_fts where chunks_fts match 'vec0'").get()).toEqual({ n: 0 });
    const edge = db.select().from(edges).get()!;
    expect(JSON.parse(edge.evidenceJson)).toEqual([{ eventId: "old", expired: true, tsSnapshot: old.ts }, "fresh"]);

    const r2 = purgeExpiredEvents(now);
    expect(r2).toEqual({ events: 0, chunks: 0, vectors: 0, relinked: 0 });
  });
});
