import { appendFileSync, cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_POLICY } from "@brainlog/types";
import { brainlogSchema, getDb, getSqlite, migrate } from "@brainlog/core";
import { ingestSpool } from "./ingest.js";

const here = dirname(fileURLToPath(import.meta.url));
const policy = { ...DEFAULT_POLICY, blockedApps: ["1Password"], blockedDomains: ["mail.google.com"] };
let spoolDir: string;

beforeAll(() => {
  migrate();
  spoolDir = mkdtempSync(join(tmpdir(), "brainlog-spool-"));
  cpSync(join(here, "..", "fixtures", "spool"), spoolDir, { recursive: true });
});

describe("ingestSpool", () => {
  it("ingests the fixture spool with dedup, diff, sampling and the policy gate", async () => {
    const r = await ingestSpool({ spoolDir, policy, platform: "darwin" });
    expect(r.files).toBe(1);
    expect(r.lines).toBe(19);
    expect(r.invalid).toBe(1);
    expect(r.dropped).toEqual({ blocked_app: 1, blocked_domain: 1, credential: 1 });
    expect(r.skipped).toEqual({ empty: 0, unchanged: 3, same_session: 0, too_soon: 1, no_new_lines: 0 });
    expect(r.inserted).toBe(11);

    const rows = getDb().select().from(brainlogSchema.events).orderBy(brainlogSchema.events.ts).all();
    expect(rows).toHaveLength(11);
    expect(new Set(rows.map((e) => e.textHash)).size).toBe(11);

    // blocked and credential text never reached disk
    const all = rows.map((e) => `${e.app} ${e.windowTitle} ${e.text}`).join("\n");
    expect(all).not.toMatch(/1Password|mail\.google|sk-abcdef/);

    const byTitle = (t: string) => rows.filter((e) => e.windowTitle === t);
    expect(byTitle("asg017/sqlite-vec")[0]?.sourceKind).toBe("title");
    expect(byTitle("asg017/sqlite-vec — README")[0]?.sourceKind).toBe("ax");

    // terminal: full text first, then only the new line after 30 s, then only the new line on re-focus
    const term = byTitle("zsh — brainlog");
    expect(term.map((e) => e.text)).toEqual([
      "$ pnpm db:migrate\n> drizzle-kit migrate\napplying 0001_fts5_vec0",
      "Error: no such module: vec0 — migration 0004 failed",
      "$ git checkout feat/graph-edges",
    ]);
    expect(term.every((e) => e.sourceKind === "terminal")).toBe(true);

    // chat: message-level dedup and DM tagging
    const dm = byTitle("DM · Priya");
    expect(dm.map((e) => e.text)).toEqual([
      "You: I'll get you the memory-layer spec by Friday.\nPriya: perfect",
      "Priya: I'll block time Friday afternoon.",
    ]);
    expect(dm.every((e) => e.sensitivity === "third_party_private")).toBe(true);

    expect(byTitle("Bank statement — September")[0]?.sensitivity).toBe("financial");
    expect(byTitle("MyChart — Results")[0]?.sensitivity).toBe("health");
    expect(rows.filter((e) => e.sensitivity === "none")).toHaveLength(7);

    // retention: expiresAt = ts + 30 d
    const first = rows[0]!;
    expect(Date.parse(first.expiresAt) - Date.parse(first.ts)).toBe(30 * 86_400_000);

    // chunks + FTS populated
    const n = getSqlite().prepare("select count(*) n from chunks_fts where chunks_fts match 'vec0'").get() as { n: number };
    expect(n.n).toBeGreaterThanOrEqual(2);
  });

  it("is incremental: a second run reads nothing, an appended line is picked up", async () => {
    const again = await ingestSpool({ spoolDir, policy, platform: "darwin" });
    expect(again.lines).toBe(0);
    expect(again.inserted).toBe(0);
    appendFileSync(
      join(spoolDir, "obs-2026-09-09.jsonl"),
      JSON.stringify({ ts: "2026-09-09T16:00:00Z", source: "window", app: "Notion", window_title: "Platform sync — notes", dwell_ms: 10 }) + "\n",
    );
    const third = await ingestSpool({ spoolDir, policy, platform: "darwin" });
    expect(third.lines).toBe(1);
    expect(third.inserted).toBe(1);
  });
});
