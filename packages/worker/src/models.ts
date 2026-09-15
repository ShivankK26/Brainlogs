/**
 * Local model setup over the Ollama HTTP API. Ollama is free and runs on the user's machine, so
 * this is the no-cost path to written answers. Nothing here talks to any other host.
 */
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { config, log } from "@brainlog/core";

/** Small enough to download in minutes, good enough for cited answers over short evidence. */
export const RECOMMENDED_MODEL = "qwen2.5:3b";
export const RECOMMENDED_SIZE = "1.9 GB";
const PREFERRED = ["qwen2.5:7b", "qwen2.5:3b", "llama3.2:3b", "llama3.1:8b", "mistral:7b", "gemma2:2b", "qwen2.5:1.5b"];

const base = () => config.ollama.baseUrl.replace(/\/$/, "");

export type PullState = { model: string; status: string; completed: number; total: number; done: boolean; error: string | null; startedAt: string };
let pull: PullState | null = null;

export function ollamaInstalled(): boolean {
  if (process.platform === "darwin") return existsSync("/Applications/Ollama.app") || existsSync("/usr/local/bin/ollama") || existsSync("/opt/homebrew/bin/ollama");
  if (process.platform === "win32") return existsSync(`${process.env.LOCALAPPDATA ?? ""}\\Programs\\Ollama\\ollama.exe`);
  return existsSync("/usr/local/bin/ollama") || existsSync("/usr/bin/ollama");
}

export async function ollamaModels(): Promise<string[] | null> {
  try {
    const res = await fetch(`${base()}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return null;
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    return (data.models ?? []).map((m) => m.name);
  } catch {
    return null;
  }
}

/** The chat model Ask should use: the configured one if present, else the best installed one. */
export async function pickAskModel(): Promise<{ model: string | null; installed: string[] }> {
  const installed = (await ollamaModels()) ?? [];
  const want = process.env.BRAINLOG_ASK_MODEL;
  if (want && installed.some((m) => m === want || m.startsWith(`${want}:`))) return { model: want, installed };
  for (const p of PREFERRED) if (installed.includes(p)) return { model: p, installed };
  const any = installed.find((m) => !/embed/i.test(m));
  return { model: any ?? null, installed };
}

export async function modelStatus() {
  const installed = ollamaInstalled();
  const models = await ollamaModels();
  const running = models !== null;
  const pick = running ? await pickAskModel() : { model: null, installed: [] as string[] };
  return { installed, running, models: models ?? [], askModel: pick.model, recommended: RECOMMENDED_MODEL, recommendedSize: RECOMMENDED_SIZE, pull, downloadUrl: "https://ollama.com/download" };
}

/** Launch the Ollama app/daemon. Returns once the API answers or after ~15 s. */
export async function startOllama(): Promise<boolean> {
  if ((await ollamaModels()) !== null) return true;
  try {
    if (process.platform === "darwin" && existsSync("/Applications/Ollama.app")) spawn("open", ["-a", "Ollama"], { stdio: "ignore", detached: true }).unref();
    else spawn("ollama", ["serve"], { stdio: "ignore", detached: true }).unref();
  } catch (e) {
    log.warn("could not start ollama", { err: String(e) });
    return false;
  }
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if ((await ollamaModels()) !== null) return true;
  }
  return false;
}

/** Start pulling a model; progress is polled through modelStatus().pull. */
export async function pullModel(model = RECOMMENDED_MODEL): Promise<PullState> {
  if (pull && !pull.done && pull.model === model) return pull;
  const state: PullState = { model, status: "starting", completed: 0, total: 0, done: false, error: null, startedAt: new Date().toISOString() };
  pull = state;
  void (async () => {
    try {
      const res = await fetch(`${base()}/api/pull`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: model, stream: true }) });
      if (!res.ok || !res.body) throw new Error(`ollama pull failed: ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const j = JSON.parse(line) as { status?: string; completed?: number; total?: number; error?: string };
          if (j.error) throw new Error(j.error);
          state.status = j.status ?? state.status;
          if (typeof j.completed === "number") state.completed = j.completed;
          if (typeof j.total === "number") state.total = j.total;
        }
      }
      state.status = "ready";
      state.done = true;
      log.info("model pulled", { model });
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e);
      state.done = true;
      log.warn("model pull failed", { model, err: state.error });
    }
  })();
  return state;
}
