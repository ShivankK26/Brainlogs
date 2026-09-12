import { config, log } from "@brainlog/core";
import type { Perms } from "./filters.js";
import { search, type SearchDeps } from "./search.js";
import type { AskResult, SearchFilters } from "./types.js";

export type AskDeps = SearchDeps & { chat?: (system: string, user: string) => Promise<string | null> };

const SYSTEM = `You are Brainlog, the user's local memory. Answer the question from the numbered evidence only.
Be plain and short. Cite evidence inline as [n]. If the evidence does not answer the question, say so in one sentence.`;

/** Local Ollama chat. Returns null when Ollama is unreachable so callers can fall back. */
export async function ollamaChat(system: string, user: string): Promise<string | null> {
  const base = config.ollama.baseUrl.replace(/\/$/, "");
  const model = process.env.BRAINLOG_ASK_MODEL ?? "qwen2.5:7b";
  try {
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, stream: false, keep_alive: config.ollama.keepAlive, options: { temperature: 0.1 }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
      signal: AbortSignal.timeout(config.ollama.timeoutMs),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content?.trim() || null;
  } catch (e) {
    log.debug("ollama chat unavailable", { err: String(e) });
    return null;
  }
}

function fmtTs(ts: string): string {
  return ts.slice(0, 16).replace("T", " ");
}

/**
 * Answer a question over memory. Local model by default; when no model is reachable the
 * answer is extractive (top snippets) so the caller still gets citations.
 */
export async function ask(input: { question: string; scope?: SearchFilters }, perms: Perms, deps: AskDeps = {}): Promise<AskResult> {
  const { hits } = await search({ q: input.question, filters: input.scope, limit: 8 }, perms, deps);
  if (hits.length === 0) return { answer: "Nothing in memory matches that question.", citations: [], model: "none" };
  const evidence = hits.map((h, i) => `[${i + 1}] ${fmtTs(h.event.ts)} · ${h.event.app} · ${h.event.windowTitle}\n${h.event.text.slice(0, 600)}`).join("\n\n");
  const chat = deps.chat ?? ollamaChat;
  const text = await chat(SYSTEM, `Question: ${input.question}\n\nEvidence:\n${evidence}`);
  if (text) {
    const cited = new Set<number>();
    for (const m of text.matchAll(/\[(\d+)\]/g)) cited.add(Number(m[1]));
    const citations = [...cited].filter((n) => n >= 1 && n <= hits.length).map((n) => hits[n - 1]!.event.id);
    return { answer: text, citations: citations.length ? citations : hits.slice(0, 3).map((h) => h.event.id), model: process.env.BRAINLOG_ASK_MODEL ?? "qwen2.5:7b" };
  }
  const top = hits.slice(0, 3);
  const answer = ["No local model is running, so here are the closest moments:", ...top.map((h, i) => `[${i + 1}] ${fmtTs(h.event.ts)} · ${h.event.app} · ${h.event.windowTitle}: ${h.event.text.split("\n")[0]?.slice(0, 160)}`)].join("\n");
  return { answer, citations: top.map((h) => h.event.id), model: "extractive" };
}
