/**
 * /api/v1 — the Brainlog HTTP surface for the in-app UI and the CLI.
 * Every handler goes through @brainlog/query, which gates and audits as actor "user"
 * (HTTP callers are the local user; agents connect over MCP, not HTTP).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Policy } from "@brainlog/types";
import { config, countEvents, ensureDataDir, getPolicy, isVecReady, listAudit, purgeExpiredEvents, setPolicy, writeAudit } from "@brainlog/core";
import { createQueryApi, PolicyDeniedError, type SearchFilters } from "@brainlog/query";
import { z } from "zod";

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
  const pausedUntil = typeof control.paused_until === "string" ? control.paused_until : null;
  const policy = getPolicy();
  return {
    version: process.env.npm_package_version ?? "0.1.0",
    port: config.port,
    dataDir: config.dataDir,
    vecReady: isVecReady(),
    ollama: await ollamaUp(),
    capture: { paused: Boolean(pausedUntil && pausedUntil > new Date().toISOString()), pausedUntil },
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
    if (method === "GET" && p === "/entities") return reply(200, await api().entities({ limit: Number(query.get("limit") ?? 20) })), true;
    if (method === "GET" && p === "/entity") {
      const id = query.get("id");
      const name = query.get("name");
      const r = id ? await api().entity({ id }) : name ? await api().entity({ name }) : null;
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
