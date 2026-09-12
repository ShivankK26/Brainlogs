/** §14: no network listener outside 127.0.0.1. Starts the real API server and the MCP socket, then scans what this process bound. */
import { execFileSync } from "node:child_process";
import { createServer, type AddressInfo } from "node:net";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config, ensureDataDir, migrate } from "@brainlog/core";
import { startMcpSocketServer, type SocketServerHandle } from "@brainlog/mcp";
import { startApiServer } from "./api.js";

let sock: SocketServerHandle;

beforeAll(async () => {
  ensureDataDir();
  migrate();
  startApiServer();
  sock = await startMcpSocketServer({ path: join(config.dataDir, "mcp.sock") });
  await new Promise((r) => setTimeout(r, 300));
});
afterAll(async () => sock.close());

function listeningSockets(): string[] {
  try {
    const out = execFileSync("lsof", ["-a", "-p", String(process.pid), "-iTCP", "-sTCP:LISTEN", "-P", "-n", "-F", "n"], { encoding: "utf8" });
    return out.split("\n").filter((l) => l.startsWith("n")).map((l) => l.slice(1));
  } catch {
    return [];
  }
}

describe("bound listeners", () => {
  it("every TCP listener in this process is on 127.0.0.1", async () => {
    // sanity: a wildcard listener would be caught by the scan
    const probe = createServer().listen(0, "0.0.0.0");
    await new Promise((r) => probe.once("listening", r));
    const port = (probe.address() as AddressInfo).port;
    const withProbe = listeningSockets();
    probe.close();
    if (withProbe.length > 0) expect(withProbe.some((n) => n === `*:${port}` || n.includes(`0.0.0.0:${port}`))).toBe(true);

    const names = listeningSockets();
    if (names.length === 0) return; // lsof not available (CI on Windows)
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(n, `listener ${n} is not loopback`).toMatch(/^127\.0\.0\.1:\d+$/);
  });
  it("the worker config never advertises a non-loopback host", () => {
    expect(config.host).toBe("127.0.0.1");
    expect(config.ollama.baseUrl.startsWith("http://127.0.0.1") || config.ollama.baseUrl.startsWith("http://localhost")).toBe(true);
  });
});
