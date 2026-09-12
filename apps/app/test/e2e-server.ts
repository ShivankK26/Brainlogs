/**
 * Boots a worker on a throwaway data dir, seeds it from the capture fixture spool,
 * plants a proposed agent note and some audit rows, and serves the built app.
 */
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = mkdtempSync(join(tmpdir(), "brainlog-e2e-"));
process.env.BRAIN_DATA_DIR = dataDir;
process.env.BRAINLOG_HOME = join(dataDir, "home");
process.env.PORT = process.env.E2E_PORT ?? "3123";
process.env.HOST = "127.0.0.1";
process.env.WEB_DIST = join(here, "..", "dist");
process.env.LOG_LEVEL = "warn";
process.env.BRAINLOG_NO_KEYCHAIN = "1";
process.env.OLLAMA_BASE_URL = "http://127.0.0.1:1"; // nothing listens: forces the extractive ask path

const core = await import("@brainlog/core");
const { ingestSpool } = await import("@brainlog/capture");
const { embedPendingBrainlogChunks, hashEmbedder, setDefaultEmbedder } = await import("@brainlog/enrich");
const { createQueryApi } = await import("@brainlog/query");
const { startApiServer } = await import("@brainlog/worker");

core.ensureDataDir();
core.migrate();
core.setPolicy({ ...core.getPolicy(), blockedDomains: ["mail.google.com"] });
cpSync(join(here, "..", "..", "..", "packages", "capture", "fixtures", "spool"), core.config.spoolDir, { recursive: true });
await ingestSpool({ platform: "darwin" });
setDefaultEmbedder(hashEmbedder);
await embedPendingBrainlogChunks({ embedder: hashEmbedder });

// entities + a commitment so the sidebar, labels and the Commitments view have rows
const db = core.getDb();
const s = core.brainlogSchema;
const events = db.select().from(s.events).all();
const dm = events.filter((e) => e.windowTitle === "DM · Priya");
const term = events.filter((e) => e.app === "Terminal");
db.insert(s.entities).values({ id: "ent-priya", kind: "person", name: "Priya", nameNorm: "priya", firstSeen: dm[0]!.ts, lastSeen: dm[1]!.ts, mentionCount: 14 }).run();
db.insert(s.entities).values({ id: "ent-repo", kind: "repo", name: "brainlog", nameNorm: "brainlog", firstSeen: term[0]!.ts, lastSeen: term[2]!.ts, mentionCount: 61 }).run();
for (const e of dm) db.insert(s.eventEntities).values({ eventId: e.id, entityId: "ent-priya" }).run();
for (const e of term) db.insert(s.eventEntities).values({ eventId: e.id, entityId: "ent-repo" }).run();
db.insert(s.commitments)
  .values({ id: "cmt-spec", text: "Memory-layer spec", fromParty: "you", toParty: "Priya", dueAt: "2026-09-11T17:00:00.000Z", status: "overdue", evidenceJson: JSON.stringify([dm[0]!.id]), createdAt: dm[0]!.ts, updatedAt: dm[0]!.ts })
  .run();
db.insert(s.commitments)
  .values({ id: "cmt-vec", text: "Fix vec0 load order on feat/graph-edges", fromParty: "you", toParty: "yourself", dueAt: null, status: "open", evidenceJson: JSON.stringify([term[1]!.id]), createdAt: term[1]!.ts, updatedAt: term[1]!.ts })
  .run();

// an agent session: a few audited queries and one proposed note
const agent = createQueryApi({ actor: "claude-code", deps: { embedder: hashEmbedder, chat: async () => null } });
await agent.search({ q: "vec0 migration" });
await agent.commitments({ party: "Priya" });
await agent.propose({ note: { kind: "decision", text: "load sqlite-vec via db.loadExtension() before migrate()", repo: "brainlog" } });
const cursor = createQueryApi({ actor: "cursor", deps: { embedder: hashEmbedder, chat: async () => null } });
try {
  await cursor.timeline({ from: "2026-09-09T00:00:00.000Z", to: "2026-09-10T00:00:00.000Z" });
} catch {
  /* expected when permissions are tightened */
}

startApiServer();
console.error(`[e2e] worker on http://127.0.0.1:${process.env.PORT} data=${dataDir}`);
