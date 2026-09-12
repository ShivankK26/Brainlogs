import { createQueryApi, type SearchFilters } from "@brainlog/query";
import type { Commitment, Event, Policy } from "@brainlog/types";
import { flagStr, parseArgs, parseDuration } from "./args.js";
import { detectTransport, http, type Transport } from "./client.js";
import { commitmentRow, eventRow, table, when } from "./format.js";

const HELP = `brainlog — it's your second brain.

Usage: brainlog <command> [options]

  status                         worker, capture and memory counts
  capture pause [--minutes 60]   pause capture; capture resume
  ingest | enrich | graph | loops | purge [--older-than 30d]
  search "<q>" [--app X] [--domain X] [--person X] [--repo X] [--from ISO] [--to ISO] [--limit 20]
  moment <eventId> [--window 15m]
  timeline [--from ISO] [--to ISO] [--limit 200]
  commitments [--status open] [--party X]
  summary [--week | --day] [--date YYYY-MM-DD]
  ask "<question>"
  remember "<text>" [--kind note|decision|failed_attempt] [--repo X]
  pending | approve <noteId> | reject <noteId>
  audit [--limit 50] [--actor X]
  export --format json|csv [--from ISO] [--to ISO]
  policy show | policy block-app <name> | policy block-domain <domain> | policy retention <days>

  --json    machine-readable output for any command`;

type Ctx = { t: Transport; json: boolean };

function out(ctx: Ctx, data: unknown, human: () => string): void {
  if (ctx.json) console.log(JSON.stringify(data, null, 2));
  else console.log(human());
}

async function local() {
  const core = await import("@brainlog/core");
  core.ensureDataDir();
  core.migrate();
  return createQueryApi({ actor: "user" });
}

async function get<T>(ctx: Ctx, path: string, fallback: () => Promise<T>): Promise<T> {
  return ctx.t.kind === "http" ? http<T>(ctx.t, "GET", path) : fallback();
}
async function post<T>(ctx: Ctx, path: string, body: unknown, fallback: () => Promise<T>): Promise<T> {
  return ctx.t.kind === "http" ? http<T>(ctx.t, "POST", path, body) : fallback();
}

function filtersFrom(flags: Record<string, string | boolean>): SearchFilters | undefined {
  const f: SearchFilters = {};
  for (const k of ["app", "domain", "person", "repo", "from", "to"] as const) {
    const v = flagStr(flags, k);
    if (v) f[k] = v;
  }
  return Object.keys(f).length ? f : undefined;
}

function qs(params: Record<string, string | number | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}

async function runJob(ctx: Ctx, name: "ingest" | "enrich" | "graph" | "loops" | "purge" | "backup"): Promise<unknown> {
  if (ctx.t.kind === "http") return http(ctx.t, "POST", `/jobs/${name}`);
  const core = await import("@brainlog/core");
  core.ensureDataDir();
  core.migrate();
  const s = await import("@brainlog/worker");
  const jobs = { ingest: s.jobCapture, enrich: s.jobEnrich, graph: s.jobGraph, loops: s.jobLoops, purge: s.jobPurge, backup: s.jobBackup };
  return jobs[name]();
}

export async function main(argv: string[]): Promise<void> {
  const { positional, flags } = parseArgs(argv);
  const [cmd, ...rest] = positional;
  if (!cmd || cmd === "help" || flags.help) {
    console.log(HELP);
    return;
  }
  const ctx: Ctx = { t: await detectTransport(), json: flags.json === true };

  switch (cmd) {
    case "status": {
      const s = await get(ctx, "/status", async () => {
        const api = await local();
        return { worker: "not running", counts: await api.stats() };
      });
      out(ctx, { transport: ctx.t.kind, ...s }, () => {
        const c = s.counts;
        const lines = [
          `worker      ${ctx.t.kind === "http" ? `running on ${ctx.t.base}` : "not running (in-process fallback)"}`,
          "capture" in s ? `capture     ${(s as { capture: { paused: boolean } }).capture.paused ? "paused" : "active"}` : null,
          "ollama" in s ? `local model ${(s as { ollama: boolean }).ollama ? "available" : "not running"}` : null,
          `events      ${c.events}${c.oldestEvent ? ` (since ${when(c.oldestEvent)})` : ""}`,
          `entities    ${c.entities}`,
          `commitments ${c.commitmentsOpen} open`,
          `to review   ${c.notesPending} notes, ${c.edgesPending} edges`,
        ];
        return lines.filter(Boolean).join("\n");
      });
      return;
    }
    case "capture": {
      const sub = rest[0];
      if (sub !== "pause" && sub !== "resume") throw new Error("usage: brainlog capture pause|resume");
      const minutes = Number(flagStr(flags, "minutes") ?? 60);
      const r = await post(ctx, `/capture/${sub}`, { minutes }, async () => {
        throw new Error("The worker is not running, so there is no capture to pause.");
      });
      out(ctx, r, () => (sub === "pause" ? `Capture paused for ${minutes} minutes.` : "Capture resumed."));
      return;
    }
    case "ingest":
    case "enrich":
    case "graph":
    case "loops":
    case "backup": {
      const r = await runJob(ctx, cmd);
      out(ctx, r, () => `${cmd}: ${JSON.stringify((r as { stats?: unknown }).stats ?? r)}`);
      return;
    }
    case "purge": {
      const olderThan = flagStr(flags, "older-than");
      const days = olderThan ? Math.round(parseDuration(olderThan) / 86_400_000) : undefined;
      const r = await post(ctx, "/purge", { olderThanDays: days }, async () => {
        const core = await import("@brainlog/core");
        core.ensureDataDir();
        core.migrate();
        const policy = core.getPolicy();
        const d = days ?? policy.retentionDays;
        return core.purgeExpiredEvents(new Date(Date.now() + (policy.retentionDays - d) * 86_400_000));
      });
      out(ctx, r, () => `Purged ${(r as { events: number }).events} events.`);
      return;
    }
    case "search": {
      const q = rest.join(" ");
      if (!q) throw new Error('usage: brainlog search "<query>"');
      const limit = Number(flagStr(flags, "limit") ?? 20);
      const filters = filtersFrom(flags);
      const r = await get(ctx, `/search${qs({ q, limit, ...(filters ?? {}) })}`, async () => (await local()).search({ q, filters, limit }));
      out(ctx, r, () => (r.hits.length ? table(r.hits.map((h) => eventRow(h.event)), { header: ["id", "when", "app", "window", "text"] }) : "No matches."));
      return;
    }
    case "moment": {
      const id = rest[0];
      if (!id) throw new Error("usage: brainlog moment <eventId>");
      const windowMs = flagStr(flags, "window") ? parseDuration(flagStr(flags, "window")!) : undefined;
      const r = await get(ctx, `/moment/${encodeURIComponent(id)}${qs({ windowMs })}`, async () => (await local()).moment({ eventId: id, ...(windowMs ? { windowMs } : {}) }));
      if (!r) throw new Error("Event not found.");
      out(ctx, r, () =>
        [
          `Focus  ${when(r.focus.ts)} · ${r.focus.app} · ${r.focus.windowTitle}`,
          r.focus.text,
          "",
          "Also on screen",
          table(r.alsoOnScreen.map((e) => [when(e.ts), e.app, e.windowTitle])),
          "",
          "After",
          table(r.after.slice(0, 10).map((e: Event) => eventRow(e))),
        ].join("\n"),
      );
      return;
    }
    case "timeline": {
      const to = flagStr(flags, "to") ?? new Date().toISOString();
      const from = flagStr(flags, "from") ?? new Date(Date.parse(to) - 86_400_000).toISOString();
      const limit = Number(flagStr(flags, "limit") ?? 200);
      const r = await get(ctx, `/timeline${qs({ from, to, limit })}`, async () => (await local()).timeline({ from, to, limit }));
      out(ctx, r, () => (r.length ? table(r.map(eventRow), { header: ["id", "when", "app", "window", "text"] }) : "No events in that range."));
      return;
    }
    case "commitments": {
      const status = flagStr(flags, "status") as Commitment["status"] | undefined;
      const party = flagStr(flags, "party");
      const r = await get(ctx, `/commitments${qs({ status, party })}`, async () => (await local()).commitments({ ...(status ? { status } : {}), ...(party ? { party } : {}) }));
      out(ctx, r, () => (r.length ? table(r.map(commitmentRow), { header: ["id", "status", "text", "parties", "due"] }) : "No commitments."));
      return;
    }
    case "summary": {
      const period = flags.day ? "day" : "week";
      const date = flagStr(flags, "date") ?? new Date().toISOString().slice(0, 10);
      const r = await get(ctx, `/summary${qs({ period, date })}`, async () => (await local()).summary({ period, date })).catch(() => null);
      out(ctx, r, () => (r ? r.markdown : `No ${period} summary yet. It is generated by the worker once there is enough activity.`));
      return;
    }
    case "ask": {
      const question = rest.join(" ");
      if (!question) throw new Error('usage: brainlog ask "<question>"');
      const r = await post(ctx, "/ask", { question }, async () => (await local()).ask({ question }));
      out(ctx, r, () => `${r.answer}\n\n(${r.citations.length} citations · ${r.model})`);
      return;
    }
    case "remember": {
      const text = rest.join(" ");
      if (!text) throw new Error('usage: brainlog remember "<text>"');
      const note = { text, kind: (flagStr(flags, "kind") ?? "note") as "note" | "decision" | "failed_attempt", ...(flagStr(flags, "repo") ? { repo: flagStr(flags, "repo") } : {}) };
      const r = await post(ctx, "/notes", { note }, async () => (await local()).propose({ note }));
      out(ctx, r, () => `Saved ${r.kind} ${r.id} (${r.status}).`);
      return;
    }
    case "pending": {
      const r = await get(ctx, "/pending", async () => (await local()).pending());
      out(ctx, r, () =>
        r.notes.length || r.edges.length
          ? [table(r.notes.map((n) => [n.id.slice(0, 8), n.author, n.kind, n.text]), { header: ["id", "author", "kind", "text"] }), r.edges.length ? `${r.edges.length} proposed edges` : ""].join("\n")
          : "Nothing to review.",
      );
      return;
    }
    case "approve":
    case "reject": {
      const id = rest[0];
      if (!id) throw new Error(`usage: brainlog ${cmd} <noteId>`);
      const r = await post(ctx, `/notes/${encodeURIComponent(id)}/${cmd}`, {}, async () => {
        const api = await local();
        return cmd === "approve" ? api.approve({ noteId: id }) : api.reject({ noteId: id });
      });
      out(ctx, r, () => (r ? `${cmd === "approve" ? "Approved" : "Rejected"} ${id}.` : "Not found."));
      return;
    }
    case "audit": {
      const limit = Number(flagStr(flags, "limit") ?? 50);
      const actor = flagStr(flags, "actor");
      const r = await get(ctx, `/audit${qs({ limit, actor })}`, async () => (await local()).audit({ limit, ...(actor ? { actor } : {}) }));
      out(ctx, r, () => table(r.map((a) => [a.ts.slice(11, 19), a.actor, a.action, a.scope, a.result, a.detail]), { header: ["time", "actor", "action", "scope", "result", "detail"] }));
      return;
    }
    case "export": {
      const format = flagStr(flags, "format") === "csv" ? "csv" : "json";
      const from = flagStr(flags, "from");
      const to = flagStr(flags, "to");
      if (ctx.t.kind === "http") {
        const data = await http<unknown>(ctx.t, "GET", `/export${qs({ format, from, to })}`);
        console.log(typeof data === "string" ? data : JSON.stringify(data, null, 2));
        return;
      }
      const api = await local();
      const events = await api.timeline({ from: from ?? "1970-01-01T00:00:00.000Z", to: to ?? new Date().toISOString(), limit: 5000 });
      if (format === "json") console.log(JSON.stringify(events, null, 2));
      else {
        const cols = ["id", "ts", "app", "windowTitle", "url", "domain", "sourceKind", "sensitivity", "text"] as const;
        const esc = (v: unknown) => {
          const s = v == null ? "" : String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        console.log([cols.join(","), ...events.map((e) => cols.map((c) => esc(e[c])).join(","))].join("\n"));
      }
      return;
    }
    case "policy": {
      const sub = rest[0] ?? "show";
      const core = await import("@brainlog/core");
      const current: Policy = await get(ctx, "/policy", async () => {
        core.ensureDataDir();
        core.migrate();
        return core.getPolicy();
      });
      let next: Policy | null = null;
      if (sub === "block-app" && rest[1]) next = { ...current, blockedApps: [...new Set([...current.blockedApps, rest[1]])] };
      else if (sub === "block-domain" && rest[1]) next = { ...current, blockedDomains: [...new Set([...current.blockedDomains, rest[1]])] };
      else if (sub === "retention" && rest[1]) next = { ...current, retentionDays: Number(rest[1]) };
      else if (sub !== "show") throw new Error("usage: brainlog policy show | block-app <name> | block-domain <domain> | retention <days>");
      const result = next
        ? ctx.t.kind === "http"
          ? await http<Policy>(ctx.t, "PUT", "/policy", next)
          : core.setPolicy(next)
        : current;
      out(ctx, result, () =>
        [
          `retention       ${result.retentionDays} days`,
          `blocked apps    ${result.blockedApps.join(", ") || "—"}`,
          `blocked domains ${result.blockedDomains.join(", ") || "—"}`,
          `cloud ask       ${result.cloudAskEnabled ? "enabled" : "off"}`,
          `agents          ${Object.keys(result.agentPermissions).join(", ") || "defaults"}`,
        ].join("\n"),
      );
      return;
    }
    default:
      throw new Error(`Unknown command "${cmd}". Run brainlog help.`);
  }
}

const invokedDirectly = process.argv[1] && /(^|\/)(index\.(ts|js)|brainlog(\.js)?)$/.test(process.argv[1]);
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
