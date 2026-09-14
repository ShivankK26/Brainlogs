import { cpSync, mkdtempSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { DEFAULT_POLICY } from "@brainlog/types";
import { getPolicy, listAudit, migrate, setPolicy } from "@brainlog/core";
import { ingestSpool } from "@brainlog/capture";
import { embedPendingBrainlogChunks, hashEmbedder, setDefaultEmbedder } from "@brainlog/enrich";
import { createQueryApi } from "@brainlog/query";
import { createBrainlogMcpServer, REMEMBER_TEXT, resolveAgentId, SocketTransport, startMcpSocketServer } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };
const parse = (r: unknown) => JSON.parse((r as ToolResult).content[0]!.text);

async function client(name: string, opts: Parameters<typeof createBrainlogMcpServer>[0] = {}) {
  const server = createBrainlogMcpServer({ api: (id) => createQueryApi({ actor: id, deps: { embedder: hashEmbedder, chat: async () => null } }), ...opts });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const c = new Client({ name, version: "1.0.0" });
  await c.connect(b);
  return c;
}

beforeAll(async () => {
  migrate();
  setPolicy({ ...DEFAULT_POLICY, blockedDomains: ["mail.google.com"] });
  const spool = mkdtempSync(join(tmpdir(), "brainlog-mcp-spool-"));
  cpSync(join(here, "..", "..", "capture", "fixtures", "spool"), spool, { recursive: true });
  await ingestSpool({ spoolDir: spool, platform: "darwin", now: new Date("2026-09-12T12:00:00.000Z") });
  setDefaultEmbedder(hashEmbedder);
  await embedPendingBrainlogChunks({ embedder: hashEmbedder });
});

describe("agent id", () => {
  it("maps client names to stable ids", () => {
    expect(resolveAgentId({ clientName: "claude-code" })).toBe("claude-code");
    expect(resolveAgentId({ clientName: "Cursor (vscode)" })).toBe("cursor");
    expect(resolveAgentId({ clientName: "OpenAI Codex CLI" })).toBe("codex");
    expect(resolveAgentId({ clientName: "My Agent!!" })).toBe("my-agent");
    expect(resolveAgentId({ explicit: "custom.bot", clientName: "cursor" })).toBe("custom.bot");
  });
});

describe("MCP tools (in-memory harness)", () => {
  it("lists the stable dotted tool names", async () => {
    const c = await client("claude-code");
    const names = (await c.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["brainlog.ask", "brainlog.commitments", "brainlog.entity", "brainlog.moment", "brainlog.remember", "brainlog.search", "brainlog.summary", "brainlog.timeline", "brainlog.whoami"]);
  });
  it("search and moment work, sensitive events are hidden from an agent", async () => {
    const c = await client("claude-code");
    const r = parse(await c.callTool({ name: "brainlog.search", arguments: { q: "vec0" } }));
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.hits[0].highlights.length).toBeGreaterThan(0);
    const m = parse(await c.callTool({ name: "brainlog.moment", arguments: { eventId: r.hits[0].event.id } }));
    expect(m.focus.id).toBe(r.hits[0].event.id);
    expect(m.alsoOnScreen.every((e: { sensitivity: string }) => e.sensitivity === "none")).toBe(true);
    const dm = parse(await c.callTool({ name: "brainlog.search", arguments: { q: "spec by Friday" } }));
    expect(dm.hits).toHaveLength(0);
  });
  it("remember writes a proposed note and says so; whoami reports permissions", async () => {
    const c = await client("cursor");
    const r = parse(await c.callTool({ name: "brainlog.remember", arguments: { text: "load sqlite-vec before migrate()", kind: "decision", repo: "brainlog" } }));
    expect(r.status).toBe("proposed");
    expect(r.message).toBe(REMEMBER_TEXT);
    const user = createQueryApi({ actor: "user" });
    expect((await user.pending()).notes.map((n) => n.id)).toContain(r.id);
    const who = parse(await c.callTool({ name: "brainlog.whoami", arguments: {} }));
    expect(who).toMatchObject({ agentId: "cursor", permissions: { readTimeline: true, readGraph: true, write: true, readSensitive: false }, retentionDays: 30 });
  });
  it("every call is audited under the agent id, and denials come back as tool errors", async () => {
    setPolicy({ ...getPolicy(), agentPermissions: { codex: { readTimeline: true, readGraph: true, write: false, readSensitive: false } } });
    const c = await client("OpenAI Codex");
    const denied = (await c.callTool({ name: "brainlog.remember", arguments: { text: "x" } })) as ToolResult;
    expect(denied.isError).toBe(true);
    expect(denied.content[0]!.text).toMatch(/Denied by policy/);
    await c.callTool({ name: "brainlog.commitments", arguments: {} });
    const audit = listAudit({ limit: 2 });
    expect(audit.map((a) => [a.actor, a.action, a.result])).toEqual([
      ["codex", "query", "ok"],
      ["codex", "write", "denied"],
    ]);
  });
  it("underscore style renames tools for strict clients", async () => {
    const c = await client("claude-code", { style: "underscore" });
    expect((await c.listTools()).tools.map((t) => t.name)).toContain("brainlog_search");
  });
});

describe("socket transport", () => {
  it("serves MCP over a unix socket with per-connection sessions", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "brainlog-sock-")), "mcp.sock");
    const handle = await startMcpSocketServer({ path, server: { api: (id) => createQueryApi({ actor: id, deps: { embedder: hashEmbedder, chat: async () => null } }) } });
    try {
      const socket = connect(path);
      await new Promise<void>((res) => socket.once("connect", () => res()));
      const c = new Client({ name: "claude-code", version: "1.0.0" });
      await c.connect(new SocketTransport(socket));
      const who = parse(await c.callTool({ name: "brainlog.whoami", arguments: {} }));
      expect(who.agentId).toBe("claude-code");
      const s = parse(await c.callTool({ name: "brainlog.search", arguments: { q: "pricing table" } }));
      expect(s.hits[0].event.text).toMatch(/Pricing table/);
      await c.close();
    } finally {
      await handle.close();
    }
  });
});
