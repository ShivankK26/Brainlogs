import { describe, expect, it } from "vitest";
import { closeDb, getSqlite, isVecReady, migrate } from "../index.js";

function tables(): string[] {
  return (getSqlite().prepare("select name from sqlite_master where type in ('table','view') order by name").all() as Array<{ name: string }>).map(
    (r) => r.name,
  );
}

describe("migrate", () => {
  it("loads sqlite-vec before creating vec0 tables and is idempotent", () => {
    migrate();
    expect(isVecReady()).toBe(true);
    const t = tables();
    for (const name of ["events", "chunks", "chunks_fts", "chunk_vec", "entities", "edges", "commitments", "summaries", "notes", "audit_entries", "policy"]) {
      expect(t, `missing ${name}`).toContain(name);
    }
    // legacy tables still present (ADR 0003)
    expect(t).toContain("observations");
    migrate();
    expect(tables()).toEqual(t);
    const vec = getSqlite().prepare("select vec_version() v").get() as { v: string };
    expect(vec.v).toMatch(/^v?\d/);
    closeDb();
  });
});
