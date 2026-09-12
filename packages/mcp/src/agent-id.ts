import { AgentId } from "@brainlog/types";

/** Map an MCP clientInfo.name (or a --agent flag) onto a Brainlogs agent id. */
export function resolveAgentId(input: { explicit?: string | null; clientName?: string | null }): string {
  const raw = (input.explicit ?? input.clientName ?? "").trim().toLowerCase();
  if (!raw) return "unknown-agent";
  if (/claude/.test(raw)) return "claude-code";
  if (/cursor/.test(raw)) return "cursor";
  if (/codex|openai/.test(raw)) return "codex";
  if (/windsurf/.test(raw)) return "windsurf";
  if (/zed/.test(raw)) return "zed";
  const slug = raw.replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "unknown-agent";
  return AgentId.safeParse(slug).success ? slug : "unknown-agent";
}
