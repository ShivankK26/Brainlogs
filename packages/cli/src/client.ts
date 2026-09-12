/**
 * Talks to the running worker over HTTP (port from ~/.brainlog/port, token from the data dir).
 * When the worker is not running, read commands fall back to the in-process query API.
 */
import { existsSync, readFileSync } from "node:fs";
import { config, readApiToken } from "@brainlog/core";

export type Transport = { kind: "http"; base: string; token: string } | { kind: "local" };

export function readPort(): number | null {
  try {
    if (!existsSync(config.portFile)) return null;
    const n = Number(readFileSync(config.portFile, "utf8").trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export async function detectTransport(): Promise<Transport> {
  const port = readPort();
  const token = readApiToken();
  if (!port || !token) return { kind: "local" };
  const base = `http://127.0.0.1:${port}`;
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) return { kind: "http", base, token };
  } catch {
    /* worker down */
  }
  return { kind: "local" };
}

export async function http<T>(t: Extract<Transport, { kind: "http" }>, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${t.base}/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${t.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(120_000),
  });
  const ct = res.headers.get("content-type") ?? "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = typeof data === "object" && data && "error" in data ? String((data as { error: unknown }).error) : `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data as T;
}
