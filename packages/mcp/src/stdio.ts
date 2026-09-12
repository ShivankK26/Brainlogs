#!/usr/bin/env node
/**
 * stdio entry: `brainlog-mcp [--agent <id>]`. Used by Claude Code, Cursor and Codex configs.
 * Opens the same SQLite file the desktop app uses; policy and audit apply exactly as in the UI.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ensureDataDir, migrate } from "@brainlog/core";
import { createBrainlogMcpServer } from "./server.js";

const args = process.argv.slice(2);
const flagIdx = args.indexOf("--agent");
const explicit = flagIdx >= 0 ? args[flagIdx + 1] : process.env.BRAINLOG_AGENT;

ensureDataDir();
migrate();
const server = createBrainlogMcpServer(explicit ? { agentId: explicit } : {});
await server.connect(new StdioServerTransport());
