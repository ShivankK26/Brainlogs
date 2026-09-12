import { desc, eq } from "drizzle-orm";
import { brainlogSchema as s, getDb, newId } from "@brainlog/core";
import type { Actor, Edge, Note } from "@brainlog/types";
import { rowToEdge, rowToNote } from "./store.js";
import type { ReviewResult } from "./types.js";

export function propose(actor: Actor, note: { kind: Note["kind"]; text: string; repo?: string; entityIds: string[] }): Note {
  const full: Note = {
    id: newId(),
    kind: note.kind,
    text: note.text,
    repo: note.repo ?? null,
    entityIds: note.entityIds,
    author: actor,
    status: actor === "user" ? "approved" : "proposed",
    createdAt: new Date().toISOString(),
  };
  getDb()
    .insert(s.notes)
    .values({ id: full.id, kind: full.kind, text: full.text, repo: full.repo, entityIdsJson: JSON.stringify(full.entityIds), author: full.author, status: full.status, createdAt: full.createdAt })
    .run();
  return full;
}

export function listNotes(opts: { status?: Note["status"]; limit?: number } = {}): Note[] {
  const db = getDb();
  const q = opts.status ? db.select().from(s.notes).where(eq(s.notes.status, opts.status)) : db.select().from(s.notes);
  return q.orderBy(desc(s.notes.createdAt)).limit(opts.limit ?? 200).all().map(rowToNote);
}

export function listProposedEdges(limit = 200): Edge[] {
  return getDb().select().from(s.edges).where(eq(s.edges.status, "proposed")).orderBy(desc(s.edges.createdAt)).limit(limit).all().map(rowToEdge);
}

export function review(target: { noteId?: string; edgeId?: string }, verdict: "approve" | "reject"): ReviewResult {
  const db = getDb();
  if (target.noteId) {
    const status = verdict === "approve" ? "approved" : "rejected";
    db.update(s.notes).set({ status }).where(eq(s.notes.id, target.noteId)).run();
    const r = db.select().from(s.notes).where(eq(s.notes.id, target.noteId)).get();
    return r ? { kind: "note", note: rowToNote(r) } : null;
  }
  if (target.edgeId) {
    const status = verdict === "approve" ? "confirmed" : "rejected";
    db.update(s.edges).set({ status }).where(eq(s.edges.id, target.edgeId)).run();
    const r = db.select().from(s.edges).where(eq(s.edges.id, target.edgeId)).get();
    return r ? { kind: "edge", edge: rowToEdge(r) } : null;
  }
  return null;
}
