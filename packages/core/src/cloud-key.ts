import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config, ensureDataDir } from "./config.js";

/**
 * The user's own Claude API key for Cloud Ask. Stored as a 0600 file in the data directory
 * (same treatment as the master key); `ANTHROPIC_API_KEY` in the environment wins when set.
 * Never written to the database, never returned to the UI in full.
 */
export function anthropicKeyPath(): string {
  return join(config.dataDir, "anthropic-api-key");
}

export function readAnthropicKey(): string | null {
  const env = process.env.ANTHROPIC_API_KEY?.trim();
  if (env) return env;
  try {
    const k = readFileSync(anthropicKeyPath(), "utf8").trim();
    return k || null;
  } catch {
    return null;
  }
}

export function writeAnthropicKey(key: string): void {
  ensureDataDir();
  writeFileSync(anthropicKeyPath(), key.trim() + "\n", { mode: 0o600 });
  chmodSync(anthropicKeyPath(), 0o600);
}

export function deleteAnthropicKey(): void {
  if (existsSync(anthropicKeyPath())) rmSync(anthropicKeyPath());
}

/** `sk-ant-…1234` style hint for the settings screen; never the key itself. */
export function anthropicKeyHint(): string | null {
  const k = readAnthropicKey();
  if (!k) return null;
  return k.length <= 10 ? "••••" : `${k.slice(0, 7)}…${k.slice(-4)}`;
}

export function anthropicKeySource(): "env" | "file" | null {
  if (process.env.ANTHROPIC_API_KEY?.trim()) return "env";
  return existsSync(anthropicKeyPath()) && readAnthropicKey() ? "file" : null;
}
