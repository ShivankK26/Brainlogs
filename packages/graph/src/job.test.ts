import { cpSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_POLICY } from "@brainlog/types";
import { brainlogSchema as s, getDb, migrate } from "@brainlog/core";
import { ingestSpool } from "@brainlog/capture";
import { createQueryApi } from "@brainlog/query";
import { runGraphJob } from "./job.js";
import { runLifecycle } from "./lifecycle.js";

const here = dirname(fileURLToPath(import.meta.url));
const user = () => createQueryApi({ actor: "user", deps: { embedder: async () => null, chat: async () => null } });

beforeAll(async () => {
  migrate();
  const spool = mkdtempSync(join(tmpdir(), "brainlog-graph-spool-"));
  mkdirSync(spool, { recursive: true });
  cpSync(join(here, "..", "fixtures", "conversations.jsonl"), join(spool, "obs-2026-09-07.jsonl"));
  const r = await ingestSpool({ spoolDir: spool, policy: DEFAULT_POLICY, platform: "darwin", now: new Date("2026-09-12T12:00:00.000Z") });
  expect(r.inserted).toBe(9);
});

describe("graph job over fixture conversations", () => {
  it("extracts entities, links them to events, writes edges and commitments", async () => {
    const stats = await runGraphJob({ now: new Date("2026-09-11T18:00:00.000Z"), model: false });
    expect(stats.events).toBe(9);
    const api = user();
    const priya = (await api.entity({ name: "Priya" }))!;
    expect(priya.entity.kind).toBe("person");
    expect(priya.recentEvents.length).toBeGreaterThanOrEqual(3);
    const repo = (await api.entity({ name: "ShivankK26/Brainlog" }))!;
    expect(repo.entity.kind).toBe("repo");
    const branch = (await api.entity({ name: "feat/graph-edges" }))!;
    expect(branch.edges.map((e) => [e.kind, e.status])).toContainEqual(["works_on", "confirmed"]);
    expect((await api.entity({ name: "asg017/sqlite-vec" }))?.entity.kind).toBe("repo");
    expect((await api.entity({ name: "Nimbleops · Onboarding — week 2" }))?.entity.kind).toBe("doc");
    expect((await api.entity({ name: "Arjun" }))?.entity.kind).toBe("person");

    const cmts = await api.commitments();
    const byText = (frag: string) => cmts.find((c) => c.text.toLowerCase().includes(frag))!;
    // promise with a due date, overdue on the 11th at 18:00 UTC (Friday noon local passed)
    const spec = byText("memory-layer spec");
    expect([spec.fromParty, spec.toParty]).toEqual(["you", "Priya"]);
    expect(spec.dueAt?.slice(0, 10)).toBe("2026-09-11");
    expect(spec.status).toBe("overdue");
    // promise closed automatically by the attachment message
    const notes = byText("ollama setup notes tonight");
    expect(notes.status).toBe("done");
    expect(notes.closedByEventId).toBeTruthy();
    // Priya's request → you owe → open; your question in a channel → waiting; Arjun's request → open
    expect(byText("could you send me your ollama").status).toBe("done");
    expect(byText("prod deploy access").status).toBe("waiting");
    expect(byText("review the pricing table").fromParty).toBe("Arjun");
    expect(byText("review the pricing table").toParty).toBe("you");
  });

  it("is incremental and idempotent on the watermark", async () => {
    const again = await runGraphJob({ now: new Date("2026-09-11T18:00:00.000Z"), model: false });
    expect(again.events).toBe(0);
    expect(again.commitments).toBe(0);
    const n = getDb().select().from(s.commitments).all().length;
    const full = await runGraphJob({ now: new Date("2026-09-11T18:00:00.000Z"), model: false, full: true });
    expect(full.events).toBe(9);
    expect(getDb().select().from(s.commitments).all().length).toBe(n);
  });

  it("marks stalled after three idle days and keeps done commitments closed", () => {
    const st = runLifecycle(new Date("2026-09-20T00:00:00.000Z"));
    const cmts = getDb().select().from(s.commitments).all();
    const arjun = cmts.find((c) => c.text.includes("review the pricing table"))!;
    expect(arjun.status).toBe("stalled");
    expect(cmts.find((c) => c.text.includes("tonight"))!.status).toBe("done");
    expect(st.stalled).toBeGreaterThanOrEqual(1);
  });

  it("writes a weekly summary whose sentences carry provenance and entity marks", async () => {
    await runGraphJob({ now: new Date("2026-09-11T18:00:00.000Z"), model: false, full: true });
    const sum = (await user().summary({ period: "week", date: "2026-09-09" }))!;
    expect(sum).not.toBeNull();
    expect(sum.markdown).toMatch(/\*\*feat\/graph-edges\*\*/);
    expect(sum.markdown).toMatch(/You told \*\*Priya\*\*/);
    expect(sum.markdown).toMatch(/failing command: Error: no such module: vec0/);
    expect(sum.sentenceProvenance.length).toBeGreaterThanOrEqual(4);
    for (const p of sum.sentenceProvenance) expect(p.eventIds.length).toBeGreaterThan(0);
  });

  it("uses the model tier when a client answers, gating low confidence into proposed edges", async () => {
    const fake = async () => JSON.stringify({ entities: [{ kind: "project", name: "Nimbleops onboarding", confidence: 0.7 }, { kind: "topic", name: "noise", confidence: 0.2 }], commitments: [{ text: "send the runbook", fromParty: "you", toParty: "Priya", dueHint: "by Monday", confidence: 0.9 }] });
    const st = await runGraphJob({ now: new Date("2026-09-11T18:00:00.000Z"), model: fake, full: true });
    expect(st.model?.batches).toBeGreaterThan(0);
    const api = user();
    expect((await api.entity({ name: "Nimbleops onboarding" }))?.entity.kind).toBe("project");
    expect(await api.entity({ name: "noise" })).toBeNull();
    const pending = await api.pending();
    expect(pending.edges.length).toBeGreaterThan(0);
    expect((await api.commitments()).some((c) => c.text === "send the runbook" && c.dueAt?.slice(0, 10) === "2026-09-14")).toBe(true);
  });
});
