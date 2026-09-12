/** Commitment lifecycle: auto-close on evidence, stalled after 3 idle days, overdue past due. */
import { and, gt, sql } from "drizzle-orm";
import { brainlogSchema as s, getDb, rowToEvent } from "@brainlog/core";
import type { Commitment, Event } from "@brainlog/types";
import { listCommitments, setCommitmentStatus } from "./store.js";

const STALL_MS = 3 * 86_400_000;
const STOP = new Set(["the", "a", "an", "to", "you", "i", "ill", "i'll", "will", "can", "by", "on", "for", "of", "and", "get", "send", "it", "this", "that", "please", "could", "would", "also", "me", "my", "your", "with", "in", "at"]);
const DELIVERED = /\b(?:here(?:'s| is| you go)|attached|sent|shared|done|merged|deployed|pushed|uploaded|finished|delivered|posted|submitted|fixed|resolved|closed|landed)\b|\.(?:md|pdf|docx?|xlsx?|pptx?|zip|png)\b/i;

export function keyTerms(text: string): string[] {
  return [...new Set(text.toLowerCase().replace(/[^a-z0-9\-/ ]+/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w)))].slice(0, 8);
}

function related(c: Commitment, e: Event): boolean {
  const terms = keyTerms(c.text);
  if (terms.length === 0) return false;
  const hay = `${e.windowTitle}\n${e.text}`.toLowerCase();
  const hits = terms.filter((t) => hay.includes(t)).length;
  return hits >= Math.min(2, terms.length);
}

function partyInvolved(c: Commitment, e: Event): boolean {
  const other = [c.fromParty, c.toParty].find((p) => p.toLowerCase() !== "you" && p.toLowerCase() !== "yourself");
  if (!other) return true;
  return `${e.windowTitle}\n${e.text}`.toLowerCase().includes(other.toLowerCase());
}

export type LifecycleStats = { closed: number; stalled: number; overdue: number; reopened: number };

/** Run transitions over every non-terminal commitment. Idempotent for a fixed `now`. */
export function runLifecycle(now = new Date()): LifecycleStats {
  const stats: LifecycleStats = { closed: 0, stalled: 0, overdue: 0, reopened: 0 };
  const nowIso = now.toISOString();
  const db = getDb();
  for (const c of listCommitments()) {
    if (c.status === "done" || c.status === "dismissed") continue;
    const later = db
      .select()
      .from(s.events)
      .where(and(gt(s.events.ts, c.createdAt), sql`${s.events.ts} <= ${nowIso}`))
      .orderBy(s.events.ts)
      .all()
      .map(rowToEvent);
    const closer = later.find((e) => related(c, e) && DELIVERED.test(e.text) && partyInvolved(c, e));
    if (closer) {
      setCommitmentStatus(c.id, "done", nowIso, closer.id);
      stats.closed++;
      continue;
    }
    const lastActivity = later.filter((e) => related(c, e)).map((e) => Date.parse(e.ts)).reduce((m, t) => Math.max(m, t), Date.parse(c.createdAt));
    let next: Commitment["status"] = c.status === "waiting" ? "waiting" : "open";
    if (c.dueAt && Date.parse(c.dueAt) < now.getTime()) next = "overdue";
    else if (now.getTime() - lastActivity > STALL_MS && next !== "waiting") next = "stalled";
    if (next !== c.status) {
      setCommitmentStatus(c.id, next, nowIso);
      if (next === "overdue") stats.overdue++;
      else if (next === "stalled") stats.stalled++;
      else stats.reopened++;
    }
  }
  return stats;
}
