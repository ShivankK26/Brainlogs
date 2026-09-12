import { getSqlite } from "@brainlog/core";
import { embedForBrainlog, type Embedder } from "@brainlog/enrich";
import { ftsQuery, tokenize } from "./terms.js";
import { highlight } from "./highlight.js";
import { entitiesForEvents, eventsByIds } from "./store.js";
import { matchesFilters, namesOf, visible, type Perms } from "./filters.js";
import type { SearchFilters, SearchResult, SearchHit } from "./types.js";

const RRF_K = 60;
const CANDIDATES = 120;

type Ranked = { eventId: string; rank: number };

function ftsCandidates(q: string): Ranked[] {
  const rows = getSqlite()
    .prepare(
      `SELECT c.event_id AS eventId, min(f.score) AS score
       FROM (SELECT rowid, bm25(chunks_fts) AS score FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY score LIMIT ?) f
       JOIN chunks c ON c.rowid = f.rowid
       GROUP BY c.event_id ORDER BY score LIMIT ?`,
    )
    .all(q, CANDIDATES * 4, CANDIDATES) as Array<{ eventId: string }>;
  return rows.map((r, i) => ({ eventId: r.eventId, rank: i + 1 }));
}

/** L2 distance between unit int8 vectors (scale 127) → cosine similarity. */
function cosineFromL2(d: number): number {
  const u = d / 127;
  return 1 - (u * u) / 2;
}

/** KNN returns the k nearest no matter how far; keep only candidates with real similarity. */
const MIN_COSINE = 0.12;

function vecCandidates(vec: Int8Array): Ranked[] {
  const rows = getSqlite()
    .prepare(
      `SELECT c.event_id AS eventId, min(v.distance) AS d
       FROM (SELECT chunk_id, distance FROM chunk_vec WHERE embedding MATCH vec_int8(?) AND k = ?) v
       JOIN chunks c ON c.id = v.chunk_id
       GROUP BY c.event_id ORDER BY d LIMIT ?`,
    )
    .all(Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength), CANDIDATES, CANDIDATES) as Array<{ eventId: string; d: number }>;
  return rows.filter((r) => cosineFromL2(r.d) >= MIN_COSINE).map((r, i) => ({ eventId: r.eventId, rank: i + 1 }));
}

/** Reciprocal rank fusion across the lexical and vector lists. */
function fuse(lists: Array<{ ranked: Ranked[]; weight: number }>): Map<string, number> {
  const scores = new Map<string, number>();
  for (const { ranked, weight } of lists) for (const { eventId, rank } of ranked) scores.set(eventId, (scores.get(eventId) ?? 0) + weight / (RRF_K + rank));
  return scores;
}

export type SearchDeps = { embedder?: Embedder };

/**
 * BM25 (FTS5) + vector similarity (sqlite-vec) fused with reciprocal rank fusion,
 * boosted by entity-link overlap with the query terms. Highlights are computed on the event text.
 */
export async function search(
  input: { q: string; filters?: SearchFilters; limit: number },
  perms: Perms,
  deps: SearchDeps = {},
): Promise<SearchResult> {
  const terms = tokenize(input.q);
  if (terms.length === 0) return { hits: [], total: 0, usedVectors: false };

  const lists: Array<{ ranked: Ranked[]; weight: number }> = [];
  try {
    lists.push({ ranked: ftsCandidates(ftsQuery(terms)), weight: 1 });
  } catch {
    // an FTS syntax edge case should degrade to vectors, never fail the search
  }
  let usedVectors = false;
  const vec = await embedForBrainlog(input.q, deps.embedder);
  if (vec) {
    try {
      lists.push({ ranked: vecCandidates(vec), weight: 0.8 });
      usedVectors = true;
    } catch {
      usedVectors = false;
    }
  }

  const fused = fuse(lists);
  const ids = [...fused.keys()];
  const events = eventsByIds(ids);
  const entities = entitiesForEvents(ids);
  const entitiesOf = (id: string) => entities.get(id) ?? [];

  const hits: SearchHit[] = [];
  for (const [eventId, base] of fused) {
    const event = events.get(eventId);
    if (!event || !visible(event, perms) || !matchesFilters(event, input.filters, entitiesOf)) continue;
    const ents = entitiesOf(eventId);
    const overlap = ents.reduce((n, e) => n + (namesOf(e).some((name) => terms.some((t) => name.includes(t))) ? 1 : 0), 0);
    const score = base * (1 + 0.25 * overlap);
    hits.push({ event, score, highlights: highlight(event.text, terms), entities: ents });
  }
  hits.sort((a, b) => b.score - a.score || b.event.ts.localeCompare(a.event.ts));
  return { hits: hits.slice(0, input.limit), total: hits.length, usedVectors };
}
