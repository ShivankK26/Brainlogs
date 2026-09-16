/** Graph writes: entity resolution, event links, edges with merged evidence, commitments, watermarks. */
import { and, eq, sql } from "drizzle-orm";
import { brainlogSchema as s, getDb, newId } from "@brainlog/core";
import type { Actor, Commitment, EdgeKind, Entity, EntityKind, EvidenceRef, ProposalStatus } from "@brainlog/types";
import { CHAT_TURN_MIN_WORDS, normName } from "./extract/deterministic.js";
import { ACRONYM, BROADCAST, INVISIBLE, PREVIEW } from "./extract/commitments.js";
import { LABEL_WORDS } from "./extract/deterministic.js";

const db = () => getDb();

function rowToEntity(r: typeof s.entities.$inferSelect): Entity {
  return { id: r.id, kind: r.kind as EntityKind, name: r.name, aliases: JSON.parse(r.aliasesJson) as string[], firstSeen: r.firstSeen, lastSeen: r.lastSeen, mentionCount: r.mentionCount };
}

/**
 * Resolve a mention to an entity: exact (kind, normalised name), then alias, else create.
 * Bumps mentionCount/lastSeen and records the surface form as an alias when it differs.
 */
export function upsertEntity(kind: EntityKind, name: string, seenAt: string): Entity {
  const norm = normName(name);
  const d = db();
  let row = d.select().from(s.entities).where(and(eq(s.entities.kind, kind), eq(s.entities.nameNorm, norm))).get();
  if (!row) {
    row = d
      .select()
      .from(s.entities)
      .where(and(eq(s.entities.kind, kind), sql`lower(${s.entities.aliasesJson}) like ${`%"${norm.replace(/[%_"]/g, "")}"%`}`))
      .get();
  }
  if (row) {
    const aliases = new Set(JSON.parse(row.aliasesJson) as string[]);
    if (name !== row.name) aliases.add(name);
    d.update(s.entities)
      .set({ mentionCount: row.mentionCount + 1, lastSeen: seenAt > row.lastSeen ? seenAt : row.lastSeen, firstSeen: seenAt < row.firstSeen ? seenAt : row.firstSeen, aliasesJson: JSON.stringify([...aliases]) })
      .where(eq(s.entities.id, row.id))
      .run();
    return rowToEntity({ ...row, mentionCount: row.mentionCount + 1, lastSeen: seenAt });
  }
  const id = newId();
  d.insert(s.entities).values({ id, kind, name, nameNorm: norm, aliasesJson: "[]", firstSeen: seenAt, lastSeen: seenAt, mentionCount: 1 }).run();
  return { id, kind, name, aliases: [], firstSeen: seenAt, lastSeen: seenAt, mentionCount: 1 };
}

const DM_TITLE_RE = /^(?:dm|direct message|private message)\s*[·|:—-]\s*(.+)$|^(.+?)\s*[·|:—-]\s*(?:dm|direct message)$/i;

/**
 * Person entities with a single-word name are kept only when some linked event shows them as a
 * real counterpart: the DM title names them, they speak two or more turns, or they are @mentioned.
 * Everything else (form labels, résumé headings) becomes a `topic`, which no People list shows.
 */
export function reclassifyDoubtfulPeople(limitEventsPerEntity = 60): { reclassified: number; checked: number } {
  const d = db();
  const people = d.select().from(s.entities).where(eq(s.entities.kind, "person")).all().filter((r) => !/\s/.test(r.name.trim()));
  let reclassified = 0;
  for (const p of people) {
    const norm = p.nameNorm;
    const rows = d
      .select({ title: s.events.windowTitle, text: s.events.text })
      .from(s.eventEntities)
      .innerJoin(s.events, eq(s.events.id, s.eventEntities.eventId))
      .where(eq(s.eventEntities.entityId, p.id))
      .limit(limitEventsPerEntity)
      .all();
    const speakerRe = new RegExp(`^\\s*${p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s+\\S`, "im");
    const real = rows.some((r) => {
      const dm = r.title.match(DM_TITLE_RE);
      const contact = (dm?.[1] ?? dm?.[2])?.trim().toLowerCase();
      if (contact === norm) return true;
      if (new RegExp(`(?<![\\w@])@${p.name}\\b`, "i").test(r.text)) return true;
      const turnLines = r.text.split("\n").filter((l) => speakerRe.test(l));
      if (turnLines.length >= 2) return true;
      return turnLines.some((l) => l.slice(l.indexOf(":") + 1).trim().split(/\s+/).filter(Boolean).length >= CHAT_TURN_MIN_WORDS);
    });
    if (!real) {
      // a topic with the same normalised name may already exist; merge by deleting the doubtful person
      const clash = d.select({ id: s.entities.id }).from(s.entities).where(and(eq(s.entities.kind, "topic"), eq(s.entities.nameNorm, norm))).get();
      if (clash) {
        d.update(s.eventEntities).set({ entityId: clash.id }).where(eq(s.eventEntities.entityId, p.id)).run();
        d.delete(s.entities).where(eq(s.entities.id, p.id)).run();
      } else {
        d.update(s.entities).set({ kind: "topic" }).where(eq(s.entities.id, p.id)).run();
      }
      reclassified++;
    }
  }
  return { reclassified, checked: people.length };
}

/**
 * Commitments recorded before the extractor learned to skip inbox previews and unnamed
 * counterparts. Dismissing (not deleting) keeps the audit trail and lets a user reopen one.
 */
export function dismissDoubtfulCommitments(now = new Date().toISOString()): number {
  const d = db();
  const rows = d.select().from(s.commitments).where(sql`${s.commitments.status} != 'dismissed'`).all();
  let n = 0;
  for (const r of rows) {
    const text = r.text.replace(INVISIBLE, "").trim();
    const unnamed = r.toParty === "them" || r.fromParty === "them";
    const preview = PREVIEW.test(text) || BROADCAST.test(text);
    const labelParty = [r.fromParty, r.toParty].some((p) => LABEL_WORDS.has(p.toLowerCase()) || ACRONYM.test(p));
    if (unnamed || preview || labelParty) {
      d.update(s.commitments).set({ status: "dismissed", updatedAt: now }).where(eq(s.commitments.id, r.id)).run();
      n++;
    }
  }
  return n;
}

export function linkEventEntity(eventId: string, entityId: string): void {
  db().insert(s.eventEntities).values({ eventId, entityId }).onConflictDoNothing().run();
}

/** Merge into an existing edge of the same (from, to, kind): weight += 1, evidence appended (deduped). Proposed edges stay proposed. */
export function upsertEdge(input: { from: string; to: string | null; kind: EdgeKind; evidence: string[]; status: ProposalStatus; proposedBy: Actor; now: string }): { id: string; created: boolean } {
  const d = db();
  const existing = d
    .select()
    .from(s.edges)
    .where(and(eq(s.edges.fromEntity, input.from), input.to ? eq(s.edges.toEntity, input.to) : sql`${s.edges.toEntity} is null`, eq(s.edges.kind, input.kind)))
    .get();
  if (existing) {
    const ev = new Set<string>();
    const keep: EvidenceRef[] = [];
    for (const r of JSON.parse(existing.evidenceJson) as EvidenceRef[]) {
      keep.push(r);
      if (typeof r === "string") ev.add(r);
    }
    let added = 0;
    for (const id of input.evidence) {
      if (ev.has(id)) continue;
      keep.push(id);
      ev.add(id);
      added++;
    }
    if (added > 0 || (existing.status === "proposed" && input.status === "confirmed")) {
      d.update(s.edges)
        .set({ weight: existing.weight + added, evidenceJson: JSON.stringify(keep), status: existing.status === "rejected" ? "rejected" : input.status === "confirmed" ? "confirmed" : existing.status })
        .where(eq(s.edges.id, existing.id))
        .run();
    }
    return { id: existing.id, created: false };
  }
  const id = newId();
  d.insert(s.edges).values({ id, fromEntity: input.from, toEntity: input.to, kind: input.kind, weight: input.evidence.length || 1, evidenceJson: JSON.stringify(input.evidence), status: input.status, proposedBy: input.proposedBy, createdAt: input.now }).run();
  return { id, created: true };
}

export function rowToCommitment(r: typeof s.commitments.$inferSelect): Commitment {
  return { id: r.id, text: r.text, fromParty: r.fromParty, toParty: r.toParty, dueAt: r.dueAt, status: r.status as Commitment["status"], evidenceEventIds: JSON.parse(r.evidenceJson) as EvidenceRef[], closedByEventId: r.closedByEventId, createdAt: r.createdAt, updatedAt: r.updatedAt };
}

function commitmentKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Insert unless an equivalent commitment (same parties, similar text, within 14 days) already exists; then append evidence. */
export function upsertCommitment(input: { text: string; fromParty: string; toParty: string; dueAt: string | null; status: Commitment["status"]; eventId: string; ts: string }): { id: string; created: boolean } {
  const d = db();
  const key = commitmentKey(input.text);
  const since = new Date(Date.parse(input.ts) - 14 * 86_400_000).toISOString();
  const candidates = d
    .select()
    .from(s.commitments)
    .where(and(sql`lower(${s.commitments.fromParty}) = ${input.fromParty.toLowerCase()}`, sql`lower(${s.commitments.toParty}) = ${input.toParty.toLowerCase()}`, sql`${s.commitments.createdAt} >= ${since}`))
    .all();
  const dup = candidates.find((c) => {
    const k = commitmentKey(c.text);
    return k === key || (k.length > 20 && (k.includes(key) || key.includes(k)));
  });
  if (dup) {
    const ev = JSON.parse(dup.evidenceJson) as EvidenceRef[];
    if (!ev.some((r) => (typeof r === "string" ? r : r.eventId) === input.eventId)) {
      ev.push(input.eventId);
      d.update(s.commitments).set({ evidenceJson: JSON.stringify(ev), updatedAt: input.ts, dueAt: dup.dueAt ?? input.dueAt }).where(eq(s.commitments.id, dup.id)).run();
    }
    return { id: dup.id, created: false };
  }
  const id = newId();
  d.insert(s.commitments).values({ id, text: input.text, fromParty: input.fromParty, toParty: input.toParty, dueAt: input.dueAt, status: input.status, evidenceJson: JSON.stringify([input.eventId]), closedByEventId: null, createdAt: input.ts, updatedAt: input.ts }).run();
  return { id, created: true };
}

export function listCommitments(): Commitment[] {
  return db().select().from(s.commitments).all().map(rowToCommitment);
}

export function setCommitmentStatus(id: string, status: Commitment["status"], now: string, closedByEventId?: string): void {
  db().update(s.commitments).set({ status, updatedAt: now, ...(closedByEventId ? { closedByEventId } : {}) }).where(eq(s.commitments.id, id)).run();
}

export function getWatermark(job: string): string | null {
  return db().select().from(s.jobWatermarks).where(eq(s.jobWatermarks.job, job)).get()?.value ?? null;
}

export function setWatermark(job: string, value: string): void {
  const now = new Date().toISOString();
  db().insert(s.jobWatermarks).values({ job, value, updatedAt: now }).onConflictDoUpdate({ target: s.jobWatermarks.job, set: { value, updatedAt: now } }).run();
}

export function upsertSummary(input: { period: "day" | "week"; start: string; end: string; markdown: string; provenance: Array<{ sentenceIdx: number; eventIds: string[] }> }): string {
  const d = db();
  const existing = d.select().from(s.summaries).where(and(eq(s.summaries.period, input.period), eq(s.summaries.start, input.start))).get();
  if (existing) {
    d.update(s.summaries).set({ end: input.end, markdown: input.markdown, provenanceJson: JSON.stringify(input.provenance) }).where(eq(s.summaries.id, existing.id)).run();
    return existing.id;
  }
  const id = newId();
  d.insert(s.summaries).values({ id, period: input.period, start: input.start, end: input.end, markdown: input.markdown, provenanceJson: JSON.stringify(input.provenance) }).run();
  return id;
}
