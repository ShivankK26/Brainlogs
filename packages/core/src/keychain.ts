/**
 * OS keychain access for the per-install master key (§14).
 * macOS: `security` (login keychain) · Windows: DPAPI via PowerShell · Linux: Secret Service via `secret-tool`.
 * Every function returns null when the backend is unavailable so callers can fall back to the 0600 file.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const KEYCHAIN_SERVICE = process.env.BRAINLOG_KEYCHAIN_SERVICE ?? "io.brainlog.desktop";
const ACCOUNT = "master-key";

function run(cmd: string, args: string[], input?: string): string | null {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"], input, timeout: 5000 }).trim();
  } catch {
    return null;
  }
}

export type KeychainBackend = "macos-keychain" | "windows-dpapi" | "linux-secret-service" | "none";

export function keychainBackend(): KeychainBackend {
  // Opt-in (BRAINLOG_USE_KEYCHAIN=1). A locked or out-of-sync login keychain makes every read prompt for a
  // password, and the key protects a database that sits in the same 0600 directory anyway (ADR 0011).
  if (process.env.BRAINLOG_USE_KEYCHAIN !== "1" || process.env.BRAINLOG_NO_KEYCHAIN === "1") return "none";
  if (process.platform === "darwin") return "macos-keychain";
  if (process.platform === "win32") return "windows-dpapi";
  if (process.platform === "linux" && run("which", ["secret-tool"])) return "linux-secret-service";
  return "none";
}

function dpapiPath(dataDir: string): string {
  return join(dataDir, "master.key.dpapi");
}

export function keychainGet(dataDir: string): string | null {
  switch (keychainBackend()) {
    case "macos-keychain":
      return run("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", ACCOUNT, "-w"]) || null;
    case "linux-secret-service":
      return run("secret-tool", ["lookup", "service", KEYCHAIN_SERVICE, "account", ACCOUNT]) || null;
    case "windows-dpapi": {
      const p = dpapiPath(dataDir);
      if (!existsSync(p)) return null;
      const blob = readFileSync(p, "utf8").trim();
      const script = `$s = ConvertTo-SecureString -String '${blob}'; $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)`;
      return run("powershell", ["-NoProfile", "-NonInteractive", "-Command", script]) || null;
    }
    default:
      return null;
  }
}

export function keychainSet(dataDir: string, key: string): boolean {
  switch (keychainBackend()) {
    case "macos-keychain":
      // Recreate rather than update: `-U` keeps an existing item's access list, and an item without
      // `security` in that list prompts for the keychain password on every read.
      run("security", ["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", ACCOUNT]);
      return run("security", ["add-generic-password", "-s", KEYCHAIN_SERVICE, "-a", ACCOUNT, "-w", key, "-T", "/usr/bin/security"]) !== null;
    case "linux-secret-service":
      return run("secret-tool", ["store", "--label", "Brainlogs master key", "service", KEYCHAIN_SERVICE, "account", ACCOUNT], key) !== null;
    case "windows-dpapi": {
      const script = `ConvertTo-SecureString -String '${key}' -AsPlainText -Force | ConvertFrom-SecureString`;
      const blob = run("powershell", ["-NoProfile", "-NonInteractive", "-Command", script]);
      if (!blob) return false;
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(dpapiPath(dataDir), blob, { encoding: "utf8", mode: 0o600 });
      return true;
    }
    default:
      return false;
  }
}

export function keychainDelete(dataDir: string): void {
  switch (keychainBackend()) {
    case "macos-keychain":
      run("security", ["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", ACCOUNT]);
      return;
    case "linux-secret-service":
      run("secret-tool", ["clear", "service", KEYCHAIN_SERVICE, "account", ACCOUNT]);
      return;
    case "windows-dpapi":
      try {
        if (existsSync(dpapiPath(dataDir))) writeFileSync(dpapiPath(dataDir), "");
      } catch {
        /* */
      }
      return;
    default:
      return;
  }
}
