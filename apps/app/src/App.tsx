import { useCallback, useEffect, useRef } from "react";
import { api } from "./lib/api";
import type { Status } from "./lib/types";
import { useAsync } from "./lib/useAsync";
import { StoreProvider, useStore, type Page } from "./state/store";
import { Sidebar } from "./components/Sidebar";
import { Palette } from "./components/Palette";
import { Toast } from "./components/Toast";
import { Overview } from "./views/Overview";
import { Memory } from "./views/Memory";
import { Places } from "./views/Places";
import { Commitments } from "./views/Commitments";
import { Audit } from "./views/Audit";
import { Privacy } from "./views/Privacy";

const G_MAP: Record<string, Page> = { p: "overview", m: "memory", c: "commitments", l: "places" };

type TauriGlobal = { core?: { invoke: (cmd: string) => Promise<unknown> } };
const tauri = (): TauriGlobal | undefined => (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;

/** Shown when the engine says window text cannot be read (macOS Accessibility revoked after an update). */
function CaptureBanner({ status }: { status: Status | null }) {
  const { bump, toastMsg } = useStore();
  const blind = status?.capture.accessibility === false;
  const down = status?.capture.engineRunning === false;
  const fix = useCallback(async () => {
    const t = tauri();
    if (t?.core) {
      try {
        await t.core.invoke("prompt_accessibility");
        await t.core.invoke("open_accessibility_settings");
        return;
      } catch {
        /* fall through to the manual hint */
      }
    }
    toastMsg("System Settings → Privacy & Security → Accessibility → turn on Brainlogs");
  }, [toastMsg]);
  if (!blind && !down) return null;
  return (
    <div className="banner" id="capBanner" role="status">
      {blind ? (
        <>
          <b>Capture is blind.</b> macOS is not letting this copy of Brainlogs read window text, so nothing new is being remembered. Turn Brainlogs on under Accessibility, then quit and reopen the app.
          <span className="acts"><button className="tb primary" onClick={fix}>Open Accessibility settings</button><button className="tb outl" onClick={bump}>Re-check</button></span>
        </>
      ) : (
        <>
          <b>Capture engine is not running.</b> The Brainlogs desktop app is closed or has stopped; memory is not being updated. Open Brainlogs from /Applications.
          <span className="acts"><button className="tb outl" onClick={bump}>Re-check</button></span>
        </>
      )}
    </div>
  );
}

function Shell() {
  const store = useStore();
  const { page, paletteOpen, openPalette, closePalette, go, version, setUser } = store;
  const status = useAsync(() => api.status(), [version]);
  // The engine heartbeats every 5 s; poll so a fixed grant clears the banner without a click.
  const statusData = status.data;
  useEffect(() => {
    if (!statusData || (statusData.capture.accessibility !== false && statusData.capture.engineRunning !== false)) return;
    const t = window.setInterval(() => store.bump(), 15_000);
    return () => window.clearInterval(t);
  }, [statusData, store]);
  useEffect(() => {
    if (status.data) setUser(status.data.user.initials);
  }, [status.data, setUser]);
  const entities = useAsync(() => api.entities(6), [version]);
  const gPending = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (paletteOpen) closePalette();
        else openPalette();
        return;
      }
      if (paletteOpen) return; // the palette handles its own keys
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "/") {
        e.preventDefault();
        openPalette();
        return;
      }
      if (gPending.current !== null && G_MAP[e.key]) {
        window.clearTimeout(gPending.current);
        gPending.current = null;
        go(G_MAP[e.key]!);
        return;
      }
      if (e.key === "g") {
        if (gPending.current !== null) window.clearTimeout(gPending.current);
        gPending.current = window.setTimeout(() => (gPending.current = null), 800);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [paletteOpen, openPalette, closePalette, go]);

  return (
    <div className="shell">
      <Sidebar status={status.data} entities={entities.data ?? []} />
      <div className={`main${status.data && (status.data.capture.accessibility === false || status.data.capture.engineRunning === false) ? " has-banner" : ""}`}>
        <CaptureBanner status={status.data} />
        {page === "overview" && <Overview />}
        {page === "places" && <Places />}
        {page === "memory" && <Memory />}
        {page === "commitments" && <Commitments />}
        {page === "audit" && <Audit />}
        {page === "privacy" && <Privacy status={status.data} />}
      </div>
      <Palette />
      <Toast />
    </div>
  );
}

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
