import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installMcp } from "./mcp-install.js";

describe("installMcp", () => {
  it("writes cursor and codex configs with the agent id, prints the claude command", () => {
    const home = mkdtempSync(join(tmpdir(), "brainlog-home-"));
    const cursor = installMcp("cursor", { home });
    expect(JSON.parse(readFileSync(cursor.wrote!, "utf8")).mcpServers.brainlog.args).toEqual(["-y", "@brainlog/mcp", "--agent", "cursor"]);
    const codex = installMcp("codex", { home });
    expect(readFileSync(codex.wrote!, "utf8")).toContain('[mcp_servers.brainlog]');
    installMcp("codex", { home });
    expect(readFileSync(codex.wrote!, "utf8").match(/mcp_servers\.brainlog/g)).toHaveLength(1);
    expect(installMcp("claude-code", { home }).command).toMatch(/^claude mcp add .*--agent claude-code$/);
  });
});
