/** The graph job: extract → resolve → link → edges → commitments → lifecycle → weekly summary. */
import { and, gt, lte } from "drizzle-orm";
import { brainlogSchema as s, getDb, log, rowToEvent } from "@brainlog/core";
import type { Event } from "@brainlog/types";
import { extractMentions } from "./extract/deterministic.js";
import { extractCommitments } from "./extract/commitments.js";
import { modelExtract, type ModelClient } from "./extract/model.js";
import { parseDue } from "./due.js";
import { runLifecycle, type LifecycleStats } from "./lifecycle.js";
import { getWatermark, linkEventEntity, setWatermark, upsertCommitment, upsertEdge, upsertEntity, reclassifyDoubtfulPeople, dismissDoubtfulCommitments } from "./store.js";
import { writeWeeklySummary } from "./summary.js";

const WATERMARK = "graph";
const CHAT_APPS = /slack|discord|whatsapp|telegram|signal|teams|imessage|messages|mail|gmail|outlook/i;
const MODEL_CONFIDENCE_FLOOR = 0.6;
const CONFIRMED_AT = 0.8;

export type GraphStats = {
  events: number;
  entities: number;
  links: number;
  edges: number;
  commitments: number;
  model: { batches: number; entities: number; commitments: number } | null;
  lifecycle: LifecycleStats;
  summary: string | null;
  watermark: string | null;
};

export type GraphJobOptions = {
  now?: Date;
  /** Use the local model tier. Defaults to true; tests pass false or a fake client. */
  model?: boolean | ModelClient;
  /** Process everything regardless of the watermark. */
  full?: boolean;
  limit?: number;
};

function isChat(e: Event): boolean {
  return CHAT_APPS.test(e.app) || e.sensitivity === "third_party_private" || /^dm\b/i.test(e.windowTitle);
}

function dmContact(e: Event): string | null {
  const m = e.windowTitle.match(/^(?:dm|direct message)\s*[·|:—-]\s*(.+)$/i);
  return m?.[1]?.trim() ?? null;
}

export async function runGraphJob(opts: GraphJobOptions = {}): Promise<GraphStats> {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const db = getDb();
  const since = opts.full ? null : getWatermark(WATERMARK);
  const rows = db
    .select()
    .from(s.events)
    .where(since ? and(gt(s.events.ts, since), lte(s.events.ts, nowIso)) : lte(s.events.ts, nowIso))
    .orderBy(s.events.ts)
    .limit(opts.limit ?? 5000)
    .all();
  const events = rows.map(rowToEvent);
  const stats: GraphStats = { events: events.length, entities: 0, links: 0, edges: 0, commitments: 0, model: null, lifecycle: { closed: 0, stalled: 0, overdue: 0, reopened: 0 }, summary: null, watermark: since };

  const seenEntities = new Set<string>();
  const perEvent = new Map<string, Map<string, { id: string; kind: string; name: string }>>();

  for (const e of events) {
    const chat = isChat(e);
    const mentions = extractMentions(e, { chat });
    const linked = new Map<string, { id: string; kind: string; name: string }>();
    for (const m of mentions) {
      const ent = upsertEntity(m.kind, m.name, e.ts);
      if (!seenEntities.has(ent.id)) {
        seenEntities.add(ent.id);
        stats.entities++;
      }
      linkEventEntity(e.id, ent.id);
      stats.links++;
      linked.set(ent.id, { id: ent.id, kind: ent.kind, name: ent.name });
    }
    perEvent.set(e.id, linked);

    // deterministic edges: branch works_on repo (same event), person mentions repo/project/doc (same event)
    const ents = [...linked.values()];
    const repos = ents.filter((x) => x.kind === "repo" || x.kind === "project");
    for (const b of ents.filter((x) => x.kind === "branch")) {
      for (const r of repos) {
        if (upsertEdge({ from: b.id, to: r.id, kind: "works_on", evidence: [e.id], status: "confirmed", proposedBy: "system", now: nowIso }).created) stats.edges++;
      }
    }
    for (const p of ents.filter((x) => x.kind === "person")) {
      for (const t of ents.filter((x) => x.kind !== "person")) {
        if (upsertEdge({ from: p.id, to: t.id, kind: "mentions", evidence: [e.id], status: "confirmed", proposedBy: "system", now: nowIso }).created) stats.edges++;
      }
    }

    if (chat) {
      const contact = dmContact(e);
      for (const c of extractCommitments(e, { contact, now: new Date(e.ts) })) {
        const status = c.intent === "request" && c.fromParty === "you" ? "waiting" : c.intent === "promise" && c.fromParty !== "you" ? "waiting" : "open";
        const r = upsertCommitment({ text: c.text, fromParty: c.fromParty, toParty: c.toParty, dueAt: c.dueAt, status, eventId: e.id, ts: e.ts });
        if (r.created) stats.commitments++;
        const from = c.fromParty !== "you" ? upsertEntity("person", c.fromParty, e.ts) : null;
        const to = c.toParty !== "you" && c.toParty !== "yourself" && c.toParty !== "them" ? upsertEntity("person", c.toParty, e.ts) : null;
        if (from && to) {
          if (upsertEdge({ from: from.id, to: to.id, kind: "owes", evidence: [e.id], status: "confirmed", proposedBy: "system", now: nowIso }).created) stats.edges++;
          if (upsertEdge({ from: to.id, to: from.id, kind: "owed_by", evidence: [e.id], status: "confirmed", proposedBy: "system", now: nowIso }).created) stats.edges++;
        }
      }
    }
  }

  // model tier over chat/email text (batches of 6 events)
  const useModel = opts.model === undefined ? true : opts.model;
  if (useModel) {
    const client = typeof useModel === "function" ? useModel : undefined;
    const chatEvents = events.filter((e) => isChat(e) && e.text.length > 20);
    const m = { batches: 0, entities: 0, commitments: 0 };
    for (let i = 0; i < chatEvents.length; i += 6) {
      const batch = chatEvents.slice(i, i + 6);
      const out = await modelExtract(batch, client);
      if (!out) break; // model not reachable: stop trying this run
      m.batches++;
      const evidence = batch.map((e) => e.id);
      for (const ent of out.entities) {
        if (ent.confidence < MODEL_CONFIDENCE_FLOOR) continue;
        const row = upsertEntity(ent.kind, ent.name, batch[batch.length - 1]!.ts);
        if (!seenEntities.has(row.id)) {
        seenEntities.add(row.id);
        stats.entities++;
      }
        m.entities++;
        for (const e of batch) if (`${e.windowTitle}\n${e.text}`.toLowerCase().includes(ent.name.toLowerCase())) linkEventEntity(e.id, row.id);
        // a low-confidence model entity is linked to the batch through a proposed edge to the strongest deterministic entity
        const anchor = [...(perEvent.get(batch[0]!.id)?.values() ?? [])][0];
        if (anchor && anchor.id !== row.id) upsertEdge({ from: row.id, to: anchor.id, kind: "mentions", evidence, status: ent.confidence >= CONFIRMED_AT ? "confirmed" : "proposed", proposedBy: "system", now: nowIso });
      }
      for (const c of out.commitments) {
        if (c.confidence < CONFIRMED_AT) continue;
        const ts = batch[batch.length - 1]!.ts;
        const dueAt = c.dueHint ? parseDue(c.dueHint, new Date(ts)) : null;
        if (upsertCommitment({ text: c.text, fromParty: c.fromParty, toParty: c.toParty, dueAt, status: c.fromParty.toLowerCase() === "you" ? "open" : "waiting", eventId: batch[0]!.id, ts }).created) {
          m.commitments++;
          stats.commitments++;
        }
      }
    }
    stats.model = m;
  }

  stats.lifecycle = runLifecycle(now);
  const cleaned = reclassifyDoubtfulPeople();
  if (cleaned.reclassified) log.info("Reclassified doubtful people", cleaned);
  const dismissed = dismissDoubtfulCommitments(nowIso);
  if (dismissed) log.info("Dismissed doubtful commitments", { dismissed });
  const last = events[events.length - 1];
  if (last) setWatermark(WATERMARK, last.ts);
  stats.watermark = last?.ts ?? since;
  try {
    stats.summary = await writeWeeklySummary(nowIso.slice(0, 10));
  } catch (e) {
    log.warn("weekly summary failed", { err: e instanceof Error ? e.name : "error" });
  }
  log.info("Graph job", { events: stats.events, entities: stats.entities, edges: stats.edges, commitments: stats.commitments, lifecycle: stats.lifecycle });
  return stats;
}
