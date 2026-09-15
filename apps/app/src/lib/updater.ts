import { useCallback, useEffect, useState } from "react";

/** Subset of the Tauri updater/process globals injected when the UI runs inside the desktop shell. */
type Update = { version: string; body?: string | null; downloadAndInstall: (cb?: (e: unknown) => void) => Promise<void> };
type TauriGlobals = { updater?: { check: () => Promise<Update | null> }; process?: { relaunch: () => Promise<void> } };
const tauri = (): TauriGlobals | undefined => (window as unknown as { __TAURI__?: TauriGlobals }).__TAURI__;

export type UpdaterState = { available: Update | null; phase: "idle" | "checking" | "downloading" | "ready" | "error"; error: string | null; install: () => Promise<void>; check: () => Promise<"update" | "current" | "unavailable"> };

/**
 * Checks GitHub Releases (via the Tauri updater plugin) on launch and every 6 h. Outside the
 * desktop shell, or while the repo is private, the check fails quietly and the UI shows nothing.
 */
export function useUpdater(): UpdaterState {
  const [available, setAvailable] = useState<Update | null>(null);
  const [phase, setPhase] = useState<UpdaterState["phase"]>("idle");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const t = tauri();
    if (!t?.updater) return;
    let alive = true;
    const check = async () => {
      try {
        setPhase("checking");
        const u = await t.updater!.check();
        if (!alive) return;
        setAvailable(u ?? null);
        setPhase("idle");
      } catch {
        if (alive) setPhase("idle");
      }
    };
    void check();
    const id = window.setInterval(check, 6 * 3_600_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);
  const check = useCallback(async (): Promise<"update" | "current" | "unavailable"> => {
    const t = tauri();
    if (!t?.updater) return "unavailable";
    try {
      setPhase("checking");
      const u = await t.updater.check();
      setAvailable(u ?? null);
      setPhase("idle");
      return u ? "update" : "current";
    } catch {
      setPhase("idle");
      return "unavailable";
    }
  }, []);
  const install = useCallback(async () => {
    const t = tauri();
    if (!available) return;
    try {
      setPhase("downloading");
      await available.downloadAndInstall();
      setPhase("ready");
      await t?.process?.relaunch();
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [available]);
  return { available, phase, error, install, check };
}
