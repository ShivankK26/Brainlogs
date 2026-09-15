import Anthropic from "@anthropic-ai/sdk";
import { config, getPolicy, log, readAnthropicKey } from "@brainlog/core";
import type { Event } from "@brainlog/types";
import type { Perms } from "./filters.js";
import { search, type SearchDeps } from "./search.js";
import { eventsBetween } from "./store.js";
import { visible } from "./filters.js";
import { clusterMoments, compose, plan, renderText, termsOf, type Structured } from "./plan.js";
import type { AskResult, SearchFilters, SearchHit } from "./types.js";

export type ChatFn = (system: string, user: string) => Promise<string | null>;
/** `chat` overrides the local model, `cloudChat` the hosted one (both mainly for tests). */
export type AskDeps = SearchDeps & { chat?: ChatFn; cloudChat?: ChatFn };

const SYSTEM = `You are Brainlogs, the user's local memory. Answer the question from the numbered evidence only.
Be plain and short. Cite evidence inline as [n]. If the evidence does not answer the question, say so in one sentence.`;

/** Local Ollama chat. Returns null when Ollama is unreachable so callers can fall back. */
export async function ollamaChat(system: string, user: string): Promise<string | null> {
  const base = config.ollama.baseUrl.replace(/\/$/, "");
  await refreshLocalModel();
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

let pickedModel: { model: string; at: number } | null = null;
const PREFERRED_LOCAL = ["qwen2.5:7b", "qwen2.5:3b", "llama3.2:3b", "llama3.1:8b", "mistral:7b", "gemma2:2b", "qwen2.5:1.5b"];

/**
 * The local chat model: `BRAINLOG_ASK_MODEL` when set, else whichever preferred model Ollama
 * has installed (cached 30 s), else the recommended small default.
 */
export function localAskModel(): string {
  return process.env.BRAINLOG_ASK_MODEL ?? pickedModel?.model ?? "qwen2.5:3b";
}

async function refreshLocalModel(): Promise<void> {
  if (process.env.BRAINLOG_ASK_MODEL) return;
  if (pickedModel && Date.now() - pickedModel.at < 30_000) return;
  try {
    const res = await fetch(`${config.ollama.baseUrl.replace(/\/$/, "")}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return;
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    const names = (data.models ?? []).map((m) => m.name);
    const model = PREFERRED_LOCAL.find((m) => names.includes(m)) ?? names.find((m) => !/embed/i.test(m));
    if (model) pickedModel = { model, at: Date.now() };
  } catch {
    /* Ollama down: keep the last pick */
  }
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

function evidenceOf(hits: SearchHit[]): string {
  return hits.map((h, i) => `[${i + 1}] ${fmtTs(h.event.ts)} · ${h.event.app} · ${h.event.windowTitle}\n${h.event.text.slice(0, 600)}`).join("\n\n");
}

function citationsOf(text: string, hits: SearchHit[]): string[] {
  const cited = new Set<number>();
  for (const m of text.matchAll(/\[(\d+)\]/g)) cited.add(Number(m[1]));
  const citations = [...cited].filter((n) => n >= 1 && n <= hits.length).map((n) => hits[n - 1]!.event.id);
  return citations.length ? citations : hits.slice(0, 3).map((h) => h.event.id);
}

/**
 * Answer a question over memory.
 *
 * 1. Plan: intent + subject + time scope, no model involved (plan.ts).
 * 2. Retrieve: hybrid search on the subject within the scope; cluster hits into moments.
 * 3. Compose: a structured answer (verdict, facts, moments) that the UI renders as-is.
 * 4. Optionally let a model write prose over the same evidence: the hosted model when Cloud Ask
 *    is on and a key exists (only `sensitivity: none` moments are sent), else local Ollama.
 */
export async function ask(input: { question: string; scope?: SearchFilters }, perms: Perms, deps: AskDeps = {}): Promise<AskResult> {
  const p = plan(input.question);
  const scope: SearchFilters = { ...(input.scope ?? {}) };
  if (p.scope.from && !scope.from) scope.from = p.scope.from;
  if (p.scope.to && !scope.to) scope.to = p.scope.to;

  let hits: SearchHit[] = [];
  let dayEvents: Event[] | undefined;
  if (p.intent === "day") {
    const from = scope.from ?? new Date(Date.now() - 86_400_000).toISOString();
    const to = scope.to ?? new Date().toISOString();
    dayEvents = eventsBetween(from, to, 5000).filter((e) => visible(e, perms));
    if (p.subject) {
      const r = await search({ q: p.subject, filters: scope, limit: 40 }, perms, deps);
      hits = r.hits;
    }
  } else {
    const q = p.subject || input.question;
    hits = (await search({ q, filters: scope, limit: 40 }, perms, deps)).hits;
    // a contact question with a topic: also pull moments where person and topic co-occur
    if (p.intent === "contact" && p.person && p.topic) {
      const more = (await search({ q: `${p.person} ${p.topic}`, filters: scope, limit: 40 }, perms, deps)).hits;
      const seen = new Set(hits.map((h) => h.event.id));
      for (const h of more) if (!seen.has(h.event.id)) hits.push(h);
    }
    // a scoped question with nothing inside the window falls back to all time, and says so
    if (hits.length === 0 && (scope.from || scope.to) && !input.scope) {
      hits = (await search({ q, filters: {}, limit: 40 }, perms, deps)).hits;
      if (hits.length) p.scope.label = `${p.scope.label ?? "that period"} (nothing then; showing all time)`;
    }
  }
  const moments = clusterMoments(hits, { person: termsOf(p.person ?? p.subject), topic: termsOf(p.topic) });
  const structured: Structured = compose(p, moments, dayEvents);
  const citations = structured.moments.map((m) => m.eventId);
  const base: AskResult = { answer: renderText(structured), citations, model: "planner", via: "none", structured };
  if (hits.length === 0 && !dayEvents?.length) return base;

  const evidenceHits = hits.slice(0, 8);
  const cloudChat = deps.cloudChat ?? (readAnthropicKey() ? claudeChat : null);
  if (getPolicy().cloudAskEnabled && cloudChat) {
    const safe = evidenceHits.filter((h) => h.event.sensitivity === "none");
    const withheld = evidenceHits.length - safe.length;
    if (safe.length > 0) {
      const text = await cloudChat(SYSTEM, `Question: ${input.question}\n\nEvidence:\n${evidenceOf(safe)}`);
      if (text) return { ...base, answer: text, citations: citationsOf(text, safe), model: CLOUD_ASK_MODEL, via: "cloud", withheld };
    }
  }
  if (evidenceHits.length > 0) {
    const chat = deps.chat ?? ollamaChat;
    const text = await chat(SYSTEM, `Question: ${input.question}\n\nEvidence:\n${evidenceOf(evidenceHits)}`);
    if (text) return { ...base, answer: text, citations: citationsOf(text, evidenceHits), model: localAskModel(), via: "local" };
  }
  return base;
}
