/**
 * Optional local-model tier. Runs only when Ollama answers; output is validated with zod
 * against a strict schema that Ollama is also given as `format`. Low-confidence results
 * become proposed edges; entities below the floor are dropped (ADR 0009).
 */
import { z } from "zod";
import { config, log } from "@brainlog/core";
import { EntityKind, type Event } from "@brainlog/types";

export const ModelExtraction = z.object({
  entities: z.array(z.object({ kind: EntityKind, name: z.string().min(1).max(120), confidence: z.number().min(0).max(1) })).default([]),
  commitments: z
    .array(z.object({ text: z.string().min(1).max(300), fromParty: z.string().min(1).max(60), toParty: z.string().min(1).max(60), dueHint: z.string().max(40).nullable().default(null), confidence: z.number().min(0).max(1) }))
    .default([]),
});
export type ModelExtraction = z.infer<typeof ModelExtraction>;

const SCHEMA = {
  type: "object",
  properties: {
    entities: { type: "array", items: { type: "object", properties: { kind: { type: "string", enum: EntityKind.options }, name: { type: "string" }, confidence: { type: "number" } }, required: ["kind", "name", "confidence"] } },
    commitments: { type: "array", items: { type: "object", properties: { text: { type: "string" }, fromParty: { type: "string" }, toParty: { type: "string" }, dueHint: { type: ["string", "null"] }, confidence: { type: "number" } }, required: ["text", "fromParty", "toParty", "dueHint", "confidence"] } },
  },
  required: ["entities", "commitments"],
} as const;

const SYSTEM = `You extract structured memory from text the user saw on their own screen.
Return people, projects, repos, branches, topics, orgs and docs that are clearly named, and any first-person promises or requests.
"you" is the local user. Be conservative: omit anything you are not sure about. Confidence is 0..1.`;

export type ModelClient = (system: string, user: string, format: unknown) => Promise<string | null>;

export async function ollamaJson(system: string, user: string, format: unknown): Promise<string | null> {
  const base = config.ollama.baseUrl.replace(/\/$/, "");
  const primary = process.env.BRAINLOG_GRAPH_MODEL ?? "qwen2.5:7b";
  for (const model of [primary, "llama3.2:3b"]) {
    try {
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, stream: false, format, keep_alive: config.ollama.keepAlive, options: { temperature: 0 }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
        signal: AbortSignal.timeout(config.ollama.timeoutMs),
      });
      if (res.status === 404) continue; // model not pulled, try the fallback
      if (!res.ok) return null;
      const data = (await res.json()) as { message?: { content?: string } };
      return data.message?.content ?? null;
    } catch (e) {
      log.debug("graph model unavailable", { model, err: String(e) });
      return null;
    }
  }
  return null;
}

export async function modelExtract(events: Event[], client: ModelClient = ollamaJson): Promise<ModelExtraction | null> {
  if (events.length === 0) return null;
  const user = events.map((e, i) => `[${i + 1}] ${e.ts.slice(0, 16)} ${e.app} · ${e.windowTitle}\n${e.text.slice(0, 1200)}`).join("\n\n");
  const raw = await client(SYSTEM, user, SCHEMA);
  if (!raw) return null;
  try {
    const parsed = ModelExtraction.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
