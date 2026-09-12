import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type InstallResult = { agent: string; wrote: string | null; command: string | null; note: string };

const SERVER = { command: "npx", args: ["-y", "@brainlog/mcp"] };

function upsertJson(path: string, key: string, entry: unknown): void {
  let json: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      json = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    } catch {
      json = {};
    }
  }
  const servers = (json.mcpServers as Record<string, unknown> | undefined) ?? {};
  servers[key] = entry;
  json.mcpServers = servers;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
}

/**
 * One-line install for the common clients. Each config runs the stdio server with an
 * explicit agent id so audit rows and permissions are attributed correctly.
 */
export function installMcp(agent: string, opts: { home?: string; dryRun?: boolean } = {}): InstallResult {
  const home = opts.home ?? homedir();
  const args = [...SERVER.args, "--agent", agent];
  switch (agent) {
    case "claude-code": {
      const command = `claude mcp add --scope user brainlog -- ${SERVER.command} ${args.join(" ")}`;
      return { agent, wrote: null, command, note: "Run the command above once. Claude Code stores it in its user scope." };
    }
    case "cursor": {
      const path = join(home, ".cursor", "mcp.json");
      if (!opts.dryRun) upsertJson(path, "brainlog", { command: SERVER.command, args });
      return { agent, wrote: path, command: null, note: "Restart Cursor. Brainlogs appears under MCP servers with the brainlog.* tools." };
    }
    case "codex": {
      const path = join(home, ".codex", "config.toml");
      const block = `\n[mcp_servers.brainlog]\ncommand = "${SERVER.command}"\nargs = [${args.map((a) => `"${a}"`).join(", ")}]\n`;
      if (!opts.dryRun) {
        mkdirSync(dirname(path), { recursive: true });
        const cur = existsSync(path) ? readFileSync(path, "utf8") : "";
        if (!cur.includes("[mcp_servers.brainlog]")) writeFileSync(path, cur + block);
      }
      return { agent, wrote: path, command: null, note: "Restart Codex. The brainlog.* tools are available in every session." };
    }
    default: {
      const snippet = JSON.stringify({ mcpServers: { brainlog: { command: SERVER.command, args } } }, null, 2);
      return { agent, wrote: null, command: null, note: `Add this to your client's MCP config:\n${snippet}` };
    }
  }
}
