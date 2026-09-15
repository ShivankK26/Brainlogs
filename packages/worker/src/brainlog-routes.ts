/**
 * /api/v1 — the Brainlogs HTTP surface for the in-app UI and the CLI.
 * Every handler goes through @brainlog/query, which gates and audits as actor "user"
 * (HTTP callers are the local user; agents connect over MCP, not HTTP).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
import { Policy } from "@brainlog/types";
import { anthropicKeyHint, anthropicKeySource, config, countEvents, deleteAnthropicKey, ensureDataDir, getPolicy, getSqlite, isVecReady, listAudit, purgeExpiredEvents, setPolicy, writeAnthropicKey, writeAudit } from "@brainlog/core";
import { CLOUD_ASK_MODEL, createQueryApi, PolicyDeniedError, type SearchFilters } from "@brainlog/query";
import { z } from "zod";
import { modelStatus, pullModel, startOllama } from "./models.js";

type Reply = (status: number, body: unknown, headers?: Record<string, string>) => void;
type Ctx = { path: string; query: URLSearchParams; method: string; readJson: <T>() => Promise<T>; reply: Reply; res: ServerResponse };

const api = () => createQueryApi({ actor: "user" });

function filtersFrom(q: URLSearchParams): SearchFilters | undefined {
  const f: SearchFilters = {};
  for (const k of ["app", "domain", "person", "repo", "from", "to"] as const) {
    const v = q.get(k);
    if (v) f[k] = v;
  }
  return Object.keys(f).length ? f : undefined;
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function controlPath(): string {
  return join(config.dataDir, "capture-control.json");
}

function readControl(): Record<string, unknown> {
  try {
    return existsSync(controlPath()) ? (JSON.parse(readFileSync(controlPath(), "utf8")) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** What the desktop capture engine last reported (apps/desktop capture.rs::write_status_file). */
type EngineStatus = { ts?: string; version?: string; accessibility?: boolean; capture_method?: string; last_obs?: string | null; last_text_at?: string | null };

function readEngineStatus(): EngineStatus | null {
  try {
    const path = join(config.dataDir, "capture-status.json");
    return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as EngineStatus) : null;
  } catch {
    return null;
  }
}

/** Engine heartbeats every 5 s; two minutes of silence means it is not running. */
const ENGINE_STALE_MS = 120_000;

function writeControl(patch: Record<string, unknown>): Record<string, unknown> {
  ensureDataDir();
  const next = { ...readControl(), ...patch };
  writeFileSync(controlPath(), JSON.stringify(next));
  return next;
}

async function ollamaUp(): Promise<boolean> {
  try {
    const res = await fetch(`${config.ollama.baseUrl.replace(/\/$/, "")}/api/tags`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function status() {
  const s = await api().stats();
  const control = readControl();
  const engine = readEngineStatus();
  const pausedUntil = typeof control.paused_until === "string" ? control.paused_until : null;
  const policy = getPolicy();
  let dbSizeBytes = 0;
  try {
    dbSizeBytes = statSync(config.dbPath).size;
  } catch {
    /* first run */
  }
  const name = (() => {
    try {
      return userInfo().username;
    } catch {
      return "you";
    }
  })();
  const agents = new Set(Object.keys(policy.agentPermissions));
  for (const a of listAudit({ limit: 2000 })) if (a.actor !== "user" && a.actor !== "system") agents.add(a.actor);
  return {
    user: { name, initials: name.slice(0, 2).toUpperCase() },
    dbSizeBytes,
    agents: [...agents],
    modelName: (await modelStatus()).askModel ?? "none",
    version: process.env.BRAINLOG_BUNDLE_VERSION ?? process.env.npm_package_version ?? "dev",
    port: config.port,
    dataDir: config.dataDir,
    vecReady: isVecReady(),
    ollama: await ollamaUp(),
    capture: {
      paused: Boolean(pausedUntil && pausedUntil > new Date().toISOString()),
      pausedUntil,
      // null = the engine has never reported (CLI-only install, or the app is not running)
      engineRunning: engine?.ts ? Date.now() - Date.parse(engine.ts) < ENGINE_STALE_MS : null,
      accessibility: engine && engine.ts && Date.now() - Date.parse(engine.ts) < ENGINE_STALE_MS ? (engine.accessibility ?? null) : null,
      lastTextAt: engine?.last_text_at ?? null,
      engineVersion: engine?.version ?? null,
    },
    cloudAsk: { enabled: policy.cloudAskEnabled, hasKey: anthropicKeySource() !== null, keySource: anthropicKeySource(), keyHint: anthropicKeyHint(), model: CLOUD_ASK_MODEL },
    retentionDays: policy.retentionDays,
    blockedApps: policy.blockedApps.length,
    blockedDomains: policy.blockedDomains.length,
    counts: s,
  };
}

const JobName = z.enum(["ingest", "enrich", "graph", "loops", "purge", "backup"]);

async function runJob(name: z.infer<typeof JobName>): Promise<unknown> {
  const s = await import("./scheduler.js");
  switch (name) {
    case "ingest":
      return s.jobCapture();
    case "enrich":
      return s.jobEnrich();
    case "loops":
      return s.jobLoops();
    case "purge":
      return s.jobPurge();
    case "backup":
      return s.jobBackup();
    case "graph":
      return s.jobGraph();
  }
}

/** Returns true when the request was handled. */
export async function handleBrainlogRoute(_req: IncomingMessage, ctx: Ctx): Promise<boolean> {
  const { path, query, method, reply } = ctx;
  if (!path.startsWith("/api/v1/")) return false;
  const p = path.slice("/api/v1".length);
  try {
    if (method === "GET" && p === "/status") return reply(200, await status()), true;
    // Local model setup (Ollama): status, start the daemon, pull the recommended model.
    if (method === "GET" && p === "/models") return reply(200, await modelStatus()), true;
    if (method === "POST" && p === "/models/start") {
      const ok = await startOllama();
      writeAudit({ actor: "user", action: "policy_change", scope: `ollama start ${ok ? "ok" : "failed"}`, result: ok ? "ok" : "denied" });
      return reply(ok ? 200 : 503, await modelStatus()), true;
    }
    if (method === "POST" && p === "/models/pull") {
      const body = await ctx.readJson<{ model?: string }>().catch(() => ({} as { model?: string }));
      const model = typeof body.model === "string" && /^[\w.:-]+$/.test(body.model) ? body.model : undefined;
      if ((await modelStatus()).running === false) return reply(503, { error: "Ollama is not running." }), true;
      await pullModel(model);
      writeAudit({ actor: "user", action: "policy_change", scope: `model pull ${model ?? "recommended"}`, result: "ok" });
      return reply(202, await modelStatus()), true;
    }
    // Distinct apps and domains seen recently, for the Memory filter panel.
    if (method === "GET" && p === "/facets") {
      const days = Math.min(365, Math.max(1, Number(query.get("days") ?? 30)));
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const sqlite = getSqlite();
      const apps = sqlite.prepare("SELECT app AS name, count(*) AS count FROM events WHERE ts >= ? GROUP BY app ORDER BY count DESC LIMIT 40").all(since);
      const domains = sqlite.prepare("SELECT domain AS name, count(*) AS count FROM events WHERE ts >= ? AND domain IS NOT NULL AND domain != '' GROUP BY domain ORDER BY count DESC LIMIT 40").all(since);
      return reply(200, { days, apps, domains }), true;
    }
    if (method === "GET" && p === "/search") {
      const limit = Number(query.get("limit") ?? 20);
      return reply(200, await api().search({ q: query.get("q") ?? "", filters: filtersFrom(query), limit })), true;
    }
    if (method === "GET" && p.startsWith("/moment/")) {
      const eventId = decodeURIComponent(p.slice("/moment/".length));
      const windowMs = query.get("windowMs") ? Number(query.get("windowMs")) : undefined;
      const m = await api().moment({ eventId, ...(windowMs ? { windowMs } : {}) });
      return reply(m ? 200 : 404, m ?? { error: "not found" }), true;
    }
    if (method === "GET" && p === "/timeline") {
      const to = query.get("to") ?? new Date().toISOString();
      const from = query.get("from") ?? new Date(Date.parse(to) - 7 * 86_400_000).toISOString();
      const limit = Number(query.get("limit") ?? 1000);
      return reply(200, await api().timeline({ from, to, filters: filtersFrom(query), limit })), true;
    }
    if (method === "GET" && p === "/pulse") return reply(200, await api().pulse({ ...(query.get("date") ? { date: query.get("date")! } : {}) })), true;
    if (method === "GET" && p === "/timeline/detailed") {
      const to = query.get("to") ?? new Date().toISOString();
      const from = query.get("from") ?? new Date(Date.parse(to) - 7 * 86_400_000).toISOString();
      const limit = Number(query.get("limit") ?? 1000);
      return reply(200, await api().timelineDetailed({ from, to, filters: filtersFrom(query), limit })), true;
    }
    if (method === "GET" && p === "/entities") return reply(200, await api().entities({ limit: Number(query.get("limit") ?? 20) })), true;
    if (method === "GET" && p === "/entity") {
      const id = query.get("id");
      const name = query.get("name");
      const r = id ? await api().entity({ id }) : name ? await api().entity({ name }) : null;
      return reply(r ? 200 : 404, r ?? { error: "not found" }), true;
    }
    const cmtStatus = p.match(/^\/commitments\/([^/]+)\/status$/);
    if (method === "POST" && cmtStatus) {
      const body = await ctx.readJson<{ status?: string }>();
      const status = body.status;
      if (status !== "done" && status !== "dismissed" && status !== "open") return reply(400, { error: "status must be done, dismissed or open" }), true;
      const r = await api().setCommitment({ id: decodeURIComponent(cmtStatus[1]!), status });
      return reply(r ? 200 : 404, r ?? { error: "not found" }), true;
    }
    if (method === "GET" && p === "/commitments") {
      const status = query.get("status") ?? undefined;
      const party = query.get("party") ?? undefined;
      return reply(200, await api().commitments({ ...(status ? { status: status as never } : {}), ...(party ? { party } : {}) })), true;
    }
    if (method === "GET" && p === "/summary") {
      const r = await api().summary({ period: (query.get("period") ?? "week") as "day" | "week", date: query.get("date") ?? new Date().toISOString().slice(0, 10) });
      return reply(r ? 200 : 404, r ?? { error: "no summary for that period yet" }), true;
    }
    if (method === "POST" && p === "/ask") {
      const body = await ctx.readJson<{ question: string; scope?: SearchFilters }>();
      return reply(200, await api().ask(body)), true;
    }
    if (method === "POST" && p === "/notes") return reply(201, await api().propose(await ctx.readJson())), true;
    if (method === "GET" && p === "/notes") {
      const status = query.get("status") as "proposed" | "approved" | "rejected" | null;
      return reply(200, await api().notes({ ...(status ? { status } : {}), limit: Number(query.get("limit") ?? 200) })), true;
    }
    if (method === "GET" && p === "/pending") return reply(200, await api().pending()), true;
    const review = p.match(/^\/(notes|edges)\/([^/]+)\/(approve|reject)$/);
    if (method === "POST" && review) {
      const [, kind, id, verdict] = review;
      const target = kind === "notes" ? { noteId: id! } : { edgeId: id! };
      const r = verdict === "approve" ? await api().approve(target) : await api().reject(target);
      return reply(r ? 200 : 404, r ?? { error: "not found" }), true;
    }
    if (method === "GET" && p === "/audit") {
      const actor = query.get("actor") ?? undefined;
      return reply(200, await api().audit({ limit: Number(query.get("limit") ?? 200), ...(actor ? { actor } : {}) })), true;
    }
    if (method === "GET" && p === "/audit.csv") {
      const rows = listAudit({ limit: 5000 });
      writeAudit({ actor: "user", action: "export", scope: "audit.csv", result: "ok", detail: `${rows.length} rows` });
      const csv = ["ts,actor,action,scope,result,detail", ...rows.map((r) => [r.ts, r.actor, r.action, r.scope, r.result, r.detail].map(csvEscape).join(","))].join("\n");
      ctx.res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="brainlog-audit.csv"' });
      ctx.res.end(csv);
      return true;
    }
    if (method === "GET" && p === "/policy") return reply(200, getPolicy()), true;
    if ((method === "PUT" || method === "PATCH") && p === "/policy") {
      const body = await ctx.readJson<Partial<Policy>>();
      const next = setPolicy(Policy.parse({ ...getPolicy(), ...body }));
      writeAudit({ actor: "user", action: "policy_change", scope: Object.keys(body).join(","), result: "ok" });
      return reply(200, next), true;
    }
    // Cloud Ask key: written as a 0600 file, never echoed back. Enabling stays a policy change.
    if ((method === "PUT" || method === "DELETE") && p === "/cloud/key") {
      if (method === "DELETE") {
        deleteAnthropicKey();
        writeAudit({ actor: "user", action: "policy_change", scope: "cloud ask key removed", result: "ok" });
        return reply(200, { hasKey: anthropicKeySource() !== null, keyHint: anthropicKeyHint() }), true;
      }
      const body = await ctx.readJson<{ apiKey?: string }>();
      const key = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
      if (!key.startsWith("sk-ant-") || key.length < 20) return reply(400, { error: "That does not look like a Claude API key (sk-ant-…)." }), true;
      writeAnthropicKey(key);
      writeAudit({ actor: "user", action: "policy_change", scope: "cloud ask key set", result: "ok" });
      return reply(200, { hasKey: true, keyHint: anthropicKeyHint() }), true;
    }
    if (method === "POST" && p === "/capture/pause") {
      const body = await ctx.readJson<{ minutes?: number }>();
      const until = new Date(Date.now() + (body.minutes ?? 60) * 60_000).toISOString();
      writeControl({ paused_until: until });
      writeAudit({ actor: "user", action: "policy_change", scope: `capture pause ${body.minutes ?? 60}m`, result: "ok" });
      return reply(200, { paused: true, pausedUntil: until }), true;
    }
    if (method === "POST" && p === "/capture/resume") {
      writeControl({ paused_until: null });
      writeAudit({ actor: "user", action: "policy_change", scope: "capture resume", result: "ok" });
      return reply(200, { paused: false, pausedUntil: null }), true;
    }
    const job = p.match(/^\/jobs\/([a-z]+)$/);
    if (method === "POST" && job) {
      const name = JobName.safeParse(job[1]);
      if (!name.success) return reply(404, { error: `unknown job ${job[1]}` }), true;
      return reply(200, await runJob(name.data)), true;
    }
    if (method === "POST" && p === "/purge") {
      const body = await ctx.readJson<{ olderThanDays?: number }>();
      const days = body.olderThanDays ?? getPolicy().retentionDays;
      // Purge everything whose *timestamp* is older than N days by temporarily treating that as expiry.
      const cutoff = new Date();
      const r = purgeExpiredEvents(new Date(cutoff.getTime() + (getPolicy().retentionDays - days) * 86_400_000));
      writeAudit({ actor: "user", action: "purge", scope: `older-than ${days}d`, result: "ok", detail: `${r.events} events` });
      return reply(200, { ...r, remaining: countEvents() }), true;
    }
    if (method === "GET" && p === "/export") {
      const format = query.get("format") === "csv" ? "csv" : "json";
      const to = query.get("to") ?? new Date().toISOString();
      const from = query.get("from") ?? "1970-01-01T00:00:00.000Z";
      const events = await api().timeline({ from, to, limit: 5000 });
      writeAudit({ actor: "user", action: "export", scope: `events ${format}`, result: "ok", detail: `${events.length} events` });
      if (format === "json") return reply(200, events), true;
      const cols = ["id", "ts", "app", "windowTitle", "url", "domain", "sourceKind", "sensitivity", "text"] as const;
      const csv = [cols.join(","), ...events.map((e) => cols.map((c) => csvEscape(e[c])).join(","))].join("\n");
      ctx.res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="brainlog-events.csv"' });
      ctx.res.end(csv);
      return true;
    }
    reply(404, { error: "not found", path });
    return true;
  } catch (e) {
    if (e instanceof PolicyDeniedError) return reply(403, { error: e.message, code: e.code }), true;
    if (e instanceof z.ZodError) return reply(400, { error: "invalid request", issues: e.issues }), true;
    throw e;
  }
}
