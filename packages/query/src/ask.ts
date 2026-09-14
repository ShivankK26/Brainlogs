import Anthropic from "@anthropic-ai/sdk";
import { config, getPolicy, log, readAnthropicKey } from "@brainlog/core";
import type { Perms } from "./filters.js";
import { search, type SearchDeps } from "./search.js";
import type { AskResult, SearchFilters, SearchHit } from "./types.js";

export type ChatFn = (system: string, user: string) => Promise<string | null>;
/** `chat` overrides the local model, `cloudChat` the hosted one (both mainly for tests). */
export type AskDeps = SearchDeps & { chat?: ChatFn; cloudChat?: ChatFn };

const SYSTEM = `You are Brainlogs, the user's local memory. Answer the question from the numbered evidence only.
Be plain and short. Cite evidence inline as [n]. If the evidence does not answer the question, say so in one sentence.`;

/** Local Ollama chat. Returns null when Ollama is unreachable so callers can fall back. */
export async function ollamaChat(system: string, user: string): Promise<string | null> {
  const base = config.ollama.baseUrl.replace(/\/$/, "");
  const model = localAskModel();
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

export function localAskModel(): string {
  return process.env.BRAINLOG_ASK_MODEL ?? "qwen2.5:7b";
}

/** Hosted model for Cloud Ask. Opt-in, user-supplied key, sensitive moments never leave the device. */
export const CLOUD_ASK_MODEL = "claude-opus-5";

/**
 * Claude chat with the user's own API key. Returns null on any failure so the caller can fall
 * back to the local model or the extractive answer; the reason is logged, never surfaced raw.
 */
export async function claudeChat(system: string, user: string, apiKey = readAnthropicKey()): Promise<string | null> {
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey, maxRetries: 1 });
  try {
    const res = await client.beta.messages.create(
      {
        model: CLOUD_ASK_MODEL,
        max_tokens: 8000,
        // A policy refusal is re-run on a fallback model inside the same call.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system,
        messages: [{ role: "user", content: user }],
      },
      { timeout: 90_000 },
    );
    if (res.stop_reason === "refusal") {
      log.warn("cloud ask refused", { category: res.stop_details?.category ?? null });
      return null;
    }
    const text = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return text || null;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) log.warn("cloud ask: API key rejected");
    else if (e instanceof Anthropic.RateLimitError) log.warn("cloud ask: rate limited");
    else if (e instanceof Anthropic.APIError) log.warn("cloud ask: API error", { status: e.status, message: e.message });
    else log.warn("cloud ask: request failed", { err: String(e) });
    return null;
  }
}

function fmtTs(ts: string): string {
  // The core runs on the user's machine, so the process zone is the user's zone.
  return new Date(ts).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Title plus the first line of text, unless the text just repeats the title. */
function headline(h: SearchHit): string {
  const first = h.event.text.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  const title = h.event.windowTitle.trim();
  if (!first || first === title || title.includes(first)) return title || first;
  if (!title || first.includes(title)) return first.slice(0, 160);
  return `${title}: ${first.slice(0, 160)}`;
}

function evidenceOf(hits: SearchHit[]): string {
  return hits.map((h, i) => `[${i + 1}] ${fmtTs(h.event.ts)} · ${h.event.app} · ${h.event.windowTitle}\n${h.event.text.slice(0, 600)}`).join("\n\n");
}

/**
 * No model at all: answer what can be answered from the hits' metadata. "When" questions get the
 * time of the newest match; everything else gets the closest moments, newest first.
 */
function extractiveAnswer(question: string, hits: SearchHit[]): { answer: string; citations: string[] } {
  const byTime = [...hits].sort((a, b) => b.event.ts.localeCompare(a.event.ts));
  const top = hits.slice(0, 3);
  const lines: string[] = [];
  if (/^\s*when\b/i.test(question) && byTime[0]) {
    const h = byTime[0];
    lines.push(`Most recent match: ${fmtTs(h.event.ts)} — ${headline(h)} (${h.event.app}) [${hits.indexOf(h) + 1}]`);
    if (byTime.length > 1) lines.push(`Earlier: ${byTime.slice(1, 3).map((x) => `${fmtTs(x.event.ts)} [${hits.indexOf(x) + 1}]`).join(", ")}`);
  } else {
    lines.push("Closest moments:");
    for (const [i, h] of top.entries()) lines.push(`[${i + 1}] ${fmtTs(h.event.ts)} · ${h.event.app} · ${headline(h)}`);
  }
  lines.push("No model is running to write a fuller answer. Install Ollama for local answers, or add a Claude API key under Data & retention.");
  const cited = new Set<string>();
  for (const m of lines.join("\n").matchAll(/\[(\d+)\]/g)) {
    const h = hits[Number(m[1]) - 1];
    if (h) cited.add(h.event.id);
  }
  return { answer: lines.join("\n"), citations: [...cited] };
}

function citationsOf(text: string, hits: SearchHit[]): string[] {
  const cited = new Set<number>();
  for (const m of text.matchAll(/\[(\d+)\]/g)) cited.add(Number(m[1]));
  const citations = [...cited].filter((n) => n >= 1 && n <= hits.length).map((n) => hits[n - 1]!.event.id);
  return citations.length ? citations : hits.slice(0, 3).map((h) => h.event.id);
}

/**
 * Answer a question over memory. Order of preference: the hosted model when the user turned
 * Cloud Ask on and gave a key (only moments tagged `sensitivity: none` are sent), then the local
 * Ollama model, then an extractive answer (top snippets) so the caller always gets citations.
 */
export async function ask(input: { question: string; scope?: SearchFilters }, perms: Perms, deps: AskDeps = {}): Promise<AskResult> {
  const { hits } = await search({ q: input.question, filters: input.scope, limit: 8 }, perms, deps);
  if (hits.length === 0) return { answer: "Nothing in memory matches that question.", citations: [], model: "none", via: "none" };

  const cloudChat = deps.cloudChat ?? (readAnthropicKey() ? claudeChat : null);
  if (getPolicy().cloudAskEnabled && cloudChat) {
    const safe = hits.filter((h) => h.event.sensitivity === "none");
    const withheld = hits.length - safe.length;
    if (safe.length > 0) {
      const text = await cloudChat(SYSTEM, `Question: ${input.question}\n\nEvidence:\n${evidenceOf(safe)}`);
      if (text) return { answer: text, citations: citationsOf(text, safe), model: CLOUD_ASK_MODEL, via: "cloud", withheld };
    }
  }

  const chat = deps.chat ?? ollamaChat;
  const text = await chat(SYSTEM, `Question: ${input.question}\n\nEvidence:\n${evidenceOf(hits)}`);
  if (text) return { answer: text, citations: citationsOf(text, hits), model: localAskModel(), via: "local" };

  const ex = extractiveAnswer(input.question, hits);
  return { answer: ex.answer, citations: ex.citations, model: "extractive", via: "none" };
}
