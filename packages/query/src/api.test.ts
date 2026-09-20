import { existsSync, readFileSync, writeFileSync, mkdtempSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_POLICY } from "@brainlog/types";
import { brainlogSchema as s, getDb, listAudit, migrate, setPolicy } from "@brainlog/core";
import { embedPendingBrainlogChunks, hashEmbedder } from "@brainlog/enrich";
import { ingestSpool } from "@brainlog/capture";
import { PolicyDeniedError } from "@brainlog/policy";
import { createQueryApi } from "./api.js";

const here = dirname(fileURLToPath(import.meta.url));
const goldenPath = join(here, "..", "fixtures", "search.golden.json");
const policy = { ...DEFAULT_POLICY, blockedApps: ["1Password"], blockedDomains: ["mail.google.com"] };
const deps = { embedder: hashEmbedder, chat: async () => null };

beforeAll(async () => {
  migrate();
  setPolicy(policy);
  const spool = mkdtempSync(join(tmpdir(), "brainlog-query-spool-"));
  cpSync(join(here, "..", "..", "capture", "fixtures", "spool"), spool, { recursive: true });
  await ingestSpool({ spoolDir: spool, policy, platform: "darwin", now: new Date("2026-09-12T12:00:00.000Z") });
  await embedPendingBrainlogChunks({ embedder: hashEmbedder });
  // link an entity so the entity boost and entity() have something to chew on
  const db = getDb();
  const dm = db.select().from(s.events).all().filter((e) => e.windowTitle === "DM · Priya");
  db.insert(s.entities).values({ id: "ent-priya", kind: "person", name: "Priya", nameNorm: "priya", aliasesJson: "[]", firstSeen: dm[0]!.ts, lastSeen: dm[1]!.ts, mentionCount: 2 }).run();
  for (const e of dm) db.insert(s.eventEntities).values({ eventId: e.id, entityId: "ent-priya" }).run();
  db.insert(s.commitments)
    .values({ id: "cmt-1", text: "Memory-layer spec", fromParty: "you", toParty: "Priya", dueAt: "2026-09-11T17:00:00.000Z", status: "overdue", evidenceJson: JSON.stringify([dm[0]!.id]), createdAt: dm[0]!.ts, updatedAt: dm[0]!.ts })
    .run();
});

const QUERIES = ["vec0 migration failed", "pricing table", "spec by Friday", "lab results", "git checkout feat/graph-edges", "sqlite-vec"];

describe("search (golden)", () => {
  it("matches the golden ranking over the fixture dataset", async () => {
    const api = createQueryApi({ actor: "user", deps });
    const actual: Record<string, Array<[string, string, string]>> = {};
    for (const q of QUERIES) {
      const r = await api.search({ q, limit: 5 });
      expect(r.usedVectors).toBe(true);
      actual[q] = r.hits.map((h) => [h.event.app, h.event.windowTitle, h.event.text.split("\n")[0]!.slice(0, 48)]);
    }
    if (process.env.UPDATE_GOLDEN || !existsSync(goldenPath)) writeFileSync(goldenPath, JSON.stringify(actual, null, 2) + "\n");
    expect(actual).toEqual(JSON.parse(readFileSync(goldenPath, "utf8")));
  });
  it("highlights the matched terms on the event text", async () => {
    const api = createQueryApi({ actor: "user", deps });
    const r = await api.search({ q: "vec0", limit: 3 });
    const h = r.hits.find((x) => x.highlights.length > 0)!.highlights[0]!;
    const [a, b] = h.matches[0]!;
    expect(h.snippet.slice(a, b).toLowerCase()).toBe("vec0");
  });
  it("applies app and time filters", async () => {
    const api = createQueryApi({ actor: "user", deps });
    expect((await api.search({ q: "vec0", filters: { app: "Terminal" } })).hits.every((h) => h.event.app === "Terminal")).toBe(true);
    expect((await api.search({ q: "vec0", filters: { to: "2026-09-09T12:00:00.000Z" } })).hits).toHaveLength(0);
  });
});

describe("moment", () => {
  it("returns the closest capture from every other window and the before/after timeline", async () => {
    const api = createQueryApi({ actor: "user", deps });
    const err = (await api.search({ q: "no such module vec0", filters: { app: "Terminal" } })).hits[0]!.event;
    const m = (await api.moment({ eventId: err.id }))!;
    expect(m.focus.id).toBe(err.id);
    const regions = m.alsoOnScreen.map((e) => `${e.app}::${e.windowTitle}`);
    expect(new Set(regions).size).toBe(regions.length);
    expect(regions).toContain("Slack::DM · Priya");
    expect(regions).not.toContain("Terminal::zsh — brainlog");
    expect(m.before.every((e) => e.ts <= m.focus.ts)).toBe(true);
    expect(m.after.every((e) => e.ts > m.focus.ts)).toBe(true);
    expect(m.after.map((e) => e.windowTitle)).toContain("DM · Priya");
    // alsoOnScreen is sorted by time distance
    const dts = m.alsoOnScreen.map((e) => Math.abs(Date.parse(e.ts) - Date.parse(m.focus.ts)));
    expect([...dts].sort((a, b) => a - b)).toEqual(dts);
  });
});

describe("policy gate + audit", () => {
  it("agents without readSensitive never see tagged events, and the user does", async () => {
    const agent = createQueryApi({ actor: "claude-code", deps });
    const user = createQueryApi({ actor: "user", deps });
    const day = { from: "2026-09-09T00:00:00.000Z", to: "2026-09-10T00:00:00.000Z" };
    const a = await agent.timeline(day);
    const u = await user.timeline(day);
    expect(a.every((e) => e.sensitivity === "none")).toBe(true);
    expect(u.length - a.length).toBe(4);
    expect((await agent.search({ q: "spec by Friday" })).hits).toHaveLength(0);
    expect((await user.search({ q: "spec by Friday" })).hits.length).toBeGreaterThan(0);
    const dm = u.find((e) => e.windowTitle === "DM · Priya")!;
    expect(await agent.moment({ eventId: dm.id })).toBeNull();
  });
  it("entity() joins events, edges and commitments", async () => {
    const user = createQueryApi({ actor: "user", deps });
    const r = (await user.entity({ name: "priya" }))!;
    expect(r.entity.kind).toBe("person");
    expect(r.recentEvents).toHaveLength(2);
    expect(r.commitments.map((c) => c.id)).toEqual(["cmt-1"]);
    expect(await user.commitments({ status: "overdue" })).toHaveLength(1);
    expect(await user.commitments({ party: "priya" })).toHaveLength(1);
  });
  it("propose is held as proposed for agents, approved for the user, and only the user reviews", async () => {
    const agent = createQueryApi({ actor: "cursor", deps });
    const user = createQueryApi({ actor: "user", deps });
    const n = await agent.propose({ note: { kind: "decision", text: "load sqlite-vec before migrate()", repo: "brainlog" } });
    expect(n.status).toBe("proposed");
    await expect(agent.approve({ noteId: n.id })).rejects.toBeInstanceOf(PolicyDeniedError);
    expect((await user.pending()).notes.map((x) => x.id)).toContain(n.id);
    const r = await user.approve({ noteId: n.id });
    expect(r).toMatchObject({ kind: "note", note: { status: "approved" } });
    expect((await user.propose({ note: { text: "user note" } })).status).toBe("approved");
  });
  it("revoked permissions deny with a typed error and every call is audited", async () => {
    setPolicy({ ...policy, agentPermissions: { codex: { readTimeline: false, readGraph: true, write: false, readSensitive: false } } });
    const codex = createQueryApi({ actor: "codex", deps });
    await expect(codex.search({ q: "vec0" })).rejects.toMatchObject({ code: "POLICY_DENIED", missing: ["readTimeline"] });
    await expect(codex.propose({ note: { text: "x" } })).rejects.toBeInstanceOf(PolicyDeniedError);
    const audit = listAudit({ limit: 4 });
    expect(audit.map((a) => [a.actor, a.action, a.result])).toEqual([
      ["codex", "write", "denied"],
      ["codex", "query", "denied"],
      ["user", "write", "ok"],
      ["user", "write", "ok"],
    ]);
    setPolicy(policy);
  });
  it("ask falls back to an extractive answer with citations when no model runs", async () => {
    const user = createQueryApi({ actor: "user", deps });
    const r = await user.ask({ question: "why did the migration fail?" });
    expect(r.model).toBe("planner");
    expect(r.structured.moments.length).toBeGreaterThan(0);
    expect(r.structured.verdict).toMatch(/moment/);
    expect(r.citations.length).toBeGreaterThan(0);
    const cited = createQueryApi({ actor: "user", deps: { ...deps, chat: async () => "It failed because vec0 was not loaded [1]." } });
    const r2 = await cited.ask({ question: "why did the migration fail?" });
    expect(r2.model).not.toBe("planner");
    expect(r2.via).toBe("local");
    expect(r2.citations).toHaveLength(1);
  });
  it("cloud ask is off by default, and when on it never sends sensitive moments", async () => {
    let sent: string | null = null;
    const cloudChat = async (_system: string, user: string) => {
      sent = user;
      return "Friday, per your DM [1].";
    };
    const off = createQueryApi({ actor: "user", deps: { ...deps, cloudChat } });
    const r0 = await off.ask({ question: "when do I owe Priya the spec?" });
    expect(sent).toBeNull();
    expect(r0.via).toBe("none");

    setPolicy({ ...policy, cloudAskEnabled: true });
    try {
      const on = createQueryApi({ actor: "user", deps: { ...deps, cloudChat } });
      // every matching moment is a private DM: nothing goes to the cloud at all
      const allPrivate = await on.ask({ question: "when do I owe Priya the spec?" });
      expect(allPrivate.via).not.toBe("cloud");
      expect(sent).toBeNull();
      // mixed evidence: the terminal moments go, the DMs are withheld
      const r = await on.ask({ question: "what happened with the memory-layer spec and the vec0 migration?" });
      expect(r.via).toBe("cloud");
      expect(r.model).toBe("claude-opus-5");
      expect(r.withheld).toBeGreaterThan(0); // the Priya DMs are third_party_private
      expect(sent).not.toBeNull();
      expect(sent).not.toContain("DM · Priya");
      expect(r.citations.length).toBeGreaterThan(0);
      const last = listAudit({ limit: 1 })[0]!;
      expect(last.scope).toContain("ask");
    } finally {
      setPolicy(policy);
    }
  });
});

describe("timeline cap", () => {
  it("keeps the newest events when a window holds more than the limit, still ascending", async () => {
    const user = createQueryApi({ actor: "user", deps });
    const all = await user.timeline({ from: "2026-01-01T00:00:00.000Z", to: "2026-12-31T00:00:00.000Z", limit: 5000 });
    expect(all.length).toBeGreaterThan(3);
    const capped = await user.timeline({ from: "2026-01-01T00:00:00.000Z", to: "2026-12-31T00:00:00.000Z", limit: 2 });
    expect(capped.map((e) => e.id)).toEqual(all.slice(-2).map((e) => e.id));
    expect(capped[0]!.ts <= capped[1]!.ts).toBe(true);
  });
});

describe("lexical path", () => {
  it("finds exact terms with FTS alone when no embedder is available", async () => {
    const api = createQueryApi({ actor: "user", deps: { embedder: async () => null, chat: async () => null } });
    const r = await api.search({ q: "vec0", limit: 5 });
    expect(r.usedVectors).toBe(false);
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.hits[0]!.event.text).toMatch(/vec0/);
    expect(r.hits[0]!.highlights.length).toBeGreaterThan(0);
  });
});

describe("recall on a person", () => {
  it("reports what is owed with them and quotes none of their words", async () => {
    const api = createQueryApi({ actor: "user", deps });
    const r = await api.recallPlace({ app: "Slack", windowTitle: "DM · Priya" });
    expect(r?.place.kind).toBe("person");
    expect(r?.place.label).toBe("Priya");
    expect(r?.withPeople).toEqual(["Priya"]);
    expect(r?.owed.map((o) => [o.direction, o.who, o.status])).toEqual([["you", "Priya", "overdue"]]);
    expect(r?.facts).toEqual([]);
    expect(r?.change).toBeNull();
  });
});
