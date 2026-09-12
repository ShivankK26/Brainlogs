/** Audit log writes. Every query/write through @brainlog/policy's gate lands here. */
import { desc, eq, sql } from "drizzle-orm";
import type { AuditEntry } from "@brainlog/types";
import { getDb } from "../db/client.js";
import { auditEntries } from "../db/brainlog-schema.js";
import { newId } from "../jobs.js";

export function writeAudit(entry: Omit<AuditEntry, "id" | "ts" | "detail"> & { ts?: string; detail?: string }): AuditEntry {
  const full: AuditEntry = { id: newId(), ts: entry.ts ?? new Date().toISOString(), ...entry, detail: entry.detail ?? "" };
  getDb().insert(auditEntries).values(full).run();
  return full;
}

export function listAudit(opts: { limit?: number; actor?: string } = {}): AuditEntry[] {
  const limit = Math.min(opts.limit ?? 200, 5000);
  const q = getDb().select().from(auditEntries).orderBy(desc(auditEntries.ts)).limit(limit);
  const rows = opts.actor ? q.where(sql`${auditEntries.actor} = ${opts.actor}`).all() : q.all();
  return rows.map((r) => ({ ...r, actor: r.actor, action: r.action as AuditEntry["action"], result: r.result as AuditEntry["result"] }));
}

export function countAudit(): number {
  return getDb().select({ n: sql<number>`count(*)` }).from(auditEntries).get()?.n ?? 0;
}

/** Finish an audit row after the gated call ran: attach counts or mark it as errored. */
export function updateAudit(id: string, patch: { result?: AuditEntry["result"]; detail?: string }): void {
  getDb().update(auditEntries).set(patch).where(eq(auditEntries.id, id)).run();
}
