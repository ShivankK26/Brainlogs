/**
 * The Brainlog MCP server (§10). A thin adapter: every tool calls @brainlog/query as the
 * connected agent, so policy gating and audit rows carry the agent's identity.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getPolicy } from "@brainlog/core";
import { PolicyDeniedError, resolvePermissions } from "@brainlog/policy";
import { createQueryApi, type QueryApi } from "@brainlog/query";
import { resolveAgentId } from "./agent-id.js";

export const VERSION = "0.1.0";
export const REMEMBER_TEXT = "Saved as proposed — approve in Brainlog to keep it.";

/** Canonical (dotted) names are the documented ones; some clients only accept `[A-Za-z0-9_-]`, so an underscore style exists (ADR 0010). */
export type ToolStyle = "dotted" | "underscore";
export const TOOLS = ["search", "moment", "timeline", "entity", "commitments", "summary", "ask", "remember", "whoami"] as const;
export function toolName(base: (typeof TOOLS)[number], style: ToolStyle = "dotted"): string {
  return style === "dotted" ? `brainlog.${base}` : `brainlog_${base}`;
}

const ScopeFilters = {
  app: z.string().optional().describe("Only events from this app, e.g. Slack"),
  domain: z.string().optional().describe("Only events from this domain, e.g. github.com"),
  person: z.string().optional().describe("Only events linked to this person"),
  repo: z.string().optional().describe("Only events linked to this repo (owner/name)"),
};
const Filters = {
  ...ScopeFilters,
  from: z.string().optional().describe("ISO timestamp lower bound"),
  to: z.string().optional().describe("ISO timestamp upper bound"),
};

function text(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
}

function fail(e: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  const msg = e instanceof PolicyDeniedError ? `Denied by policy: ${e.message}` : e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text", text: msg }], isError: true };
}

export type ServerOptions = {
  /** Fixed agent id. When omitted the id comes from the client's initialize `clientInfo.name`. */
  agentId?: string;
  style?: ToolStyle;
  /** Test hook: swap the query API factory. */
  api?: (agentId: string) => QueryApi;
};

export function createBrainlogMcpServer(opts: ServerOptions = {}): McpServer {
  const style = opts.style ?? ((process.env.BRAINLOG_MCP_TOOL_STYLE === "underscore" ? "underscore" : "dotted") as ToolStyle);
  const server = new McpServer({ name: "brainlog", version: VERSION }, { capabilities: { tools: {} } });
  let api: QueryApi | null = null;
  const actor = (): string => opts.agentId ?? resolveAgentId({ clientName: server.server.getClientVersion()?.name ?? null });
  const q = (): QueryApi => (api ??= (opts.api ?? ((id) => createQueryApi({ actor: id })))(actor()));
  const call = async <T>(fn: (a: QueryApi) => Promise<T>) => {
    try {
      return text(await fn(q()));
    } catch (e) {
      return fail(e);
    }
  };
  const t = (base: (typeof TOOLS)[number]) => toolName(base, style);

  server.registerTool(t("search"), {
    title: "Search memory",
    description: "Search what the user saw on their screen: pages, messages, terminal output. Returns ranked events with highlights and linked entities.",
    inputSchema: { q: z.string().min(1).max(500), limit: z.number().int().min(1).max(50).optional(), ...Filters },
  }, ({ q: query, limit, ...filters }) => call((a) => a.search({ q: query, limit: limit ?? 10, filters: Object.values(filters).some(Boolean) ? filters : undefined })));

  server.registerTool(t("moment"), {
    title: "Rebuild a moment",
    description: "Everything on screen around one event: the focus event, what else was open, and what happened before and after.",
    inputSchema: { eventId: z.string().min(1), windowMs: z.number().int().positive().optional() },
  }, ({ eventId, windowMs }) => call((a) => a.moment({ eventId, ...(windowMs ? { windowMs } : {}) })));

  server.registerTool(t("timeline"), {
    title: "Timeline",
    description: "Events between two timestamps, oldest first. Use filters to narrow by app, domain, person or repo.",
    inputSchema: { from: z.string(), to: z.string(), limit: z.number().int().min(1).max(500).optional(), ...ScopeFilters },
  }, ({ from, to, limit, ...filters }) => call((a) => a.timeline({ from, to, limit: limit ?? 200, filters: Object.values(filters).some(Boolean) ? filters : undefined })));

  server.registerTool(t("entity"), {
    title: "Entity",
    description: "A person, project, repo, branch, topic, org or doc with its edges, recent events and commitments.",
    inputSchema: { name: z.string().optional(), id: z.string().optional() },
  }, ({ name, id }) => call((a) => (id ? a.entity({ id }) : a.entity({ name: name ?? "" }))));

  server.registerTool(t("commitments"), {
    title: "Commitments",
    description: "Promises and requests extracted from the user's messages, with lifecycle status (open, waiting, stalled, overdue, done).",
    inputSchema: { status: z.enum(["open", "waiting", "stalled", "overdue", "done", "dismissed"]).optional(), party: z.string().optional() },
  }, ({ status, party }) => call((a) => a.commitments({ ...(status ? { status } : {}), ...(party ? { party } : {}) })));

  server.registerTool(t("summary"), {
    title: "Summary",
    description: "The day or week narrative for a date (YYYY-MM-DD), with sentence-level provenance to source events.",
    inputSchema: { period: z.enum(["day", "week"]).optional(), date: z.string().optional() },
  }, ({ period, date }) => call((a) => a.summary({ period: period ?? "week", date: date ?? new Date().toISOString().slice(0, 10) })));

  server.registerTool(t("ask"), {
    title: "Ask memory",
    description: "Answer a question over memory with citations. Uses the local model when one is running; otherwise returns the closest moments.",
    inputSchema: { question: z.string().min(1).max(2000), ...Filters },
  }, ({ question, ...scope }) => call((a) => a.ask({ question, scope: Object.values(scope).some(Boolean) ? scope : undefined })));

  server.registerTool(t("remember"), {
    title: "Remember",
    description: `Write a note, decision or failed attempt into the user's memory. Held as proposed until the user approves it in Brainlog.`,
    inputSchema: { text: z.string().min(1).max(4000), kind: z.enum(["note", "decision", "failed_attempt"]).optional(), repo: z.string().optional(), entityIds: z.array(z.string()).optional() },
  }, ({ text: body, kind, repo, entityIds }) => call(async (a) => {
    const note = await a.propose({ note: { text: body, kind: kind ?? "note", ...(repo ? { repo } : {}), entityIds: entityIds ?? [] } });
    return { id: note.id, status: note.status, message: REMEMBER_TEXT };
  }));

  server.registerTool(t("whoami"), {
    title: "Who am I",
    description: "The agent id Brainlog sees this connection as, the permissions granted to it, and the retention window.",
    inputSchema: {},
  }, async () => {
    const policy = getPolicy();
    const id = actor();
    return text({ agentId: id, permissions: resolvePermissions(policy, id), retentionDays: policy.retentionDays, toolStyle: style, version: VERSION });
  });

  return server;
}
