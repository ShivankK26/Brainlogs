/** Serve MCP over ~/.brainlog/mcp.sock (a named pipe on Windows). One MCP session per connection. */
import { chmodSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { dirname } from "node:path";
import { config, log } from "@brainlog/core";
import { createBrainlogMcpServer, type ServerOptions } from "./server.js";
import { SocketTransport } from "./socket-transport.js";

export type SocketServerHandle = { path: string; server: Server; close: () => Promise<void> };

export async function startMcpSocketServer(opts: { path?: string; server?: ServerOptions } = {}): Promise<SocketServerHandle> {
  const path = opts.path ?? config.mcpSocketPath;
  if (process.platform !== "win32") {
    mkdirSync(dirname(path), { recursive: true });
    if (existsSync(path)) unlinkSync(path); // stale socket from a previous run
  }
  const server = createServer((socket: Socket) => {
    const mcp = createBrainlogMcpServer(opts.server);
    const transport = new SocketTransport(socket);
    mcp.connect(transport).catch((e) => log.warn("mcp socket session failed", { err: String(e) }));
    socket.on("close", () => void mcp.close().catch(() => undefined));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(path, () => resolve());
  });
  if (process.platform !== "win32") {
    try {
      chmodSync(path, 0o600); // only this user can talk to the memory
    } catch {
      /* best effort */
    }
  }
  log.info("MCP socket listening", { path });
  return {
    path,
    server,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          if (process.platform !== "win32" && existsSync(path)) {
            try {
              unlinkSync(path);
            } catch {
              /* */
            }
          }
          resolve();
        });
      }),
  };
}
