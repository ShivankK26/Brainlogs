import type { Entity, Status } from "../lib/types";
import { KIND_COLOR, bytes, compact, looksLikePersonName } from "../lib/format";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useStore, type Page } from "../state/store";
import { useUpdater } from "../lib/updater";

type TauriGlobal = { core?: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> } };
const tauri = (): TauriGlobal | undefined => (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
import { IcAudit, IcCheck, IcChev, IcMemory, IcPulse, IcSearch, IcShield } from "./Icons";

/** One line for the sidebar foot: paused beats blind beats engine-down beats active. */
export function captureHealth(status: Status | null): { label: string; tone: "ok" | "off" | "bad" | "unknown" } {
  if (!status) return { label: "Connecting…", tone: "unknown" };
  const c = status.capture;
  if (c.paused) return { label: "Capture paused", tone: "off" };
  if (c.accessibility === false) return { label: "Capture blind · Accessibility off", tone: "bad" };
  if (c.engineRunning === false) return { label: "Capture engine not running", tone: "bad" };
  return { label: "Capture active", tone: "ok" };
}

export function Sidebar({ status, entities }: { status: Status | null; entities: Entity[] }) {
  const { page, go, openPalette, setFilter } = useStore();
  const health = captureHealth(status);
  const upd = useUpdater();
  const { toastMsg, bump } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);
  const checkUpdates = async () => {
    setMenuOpen(false);
    const r = await upd.check();
    toastMsg(r === "update" ? `Update available: ${upd.available?.version ?? "new version"}` : r === "current" ? `You're on the latest version${status?.version ? ` (${status.version})` : ""}` : "Update check is only available in the desktop app");
  };
  const toggleCapture = async () => {
    setMenuOpen(false);
    if (!status) return;
    await api.capture(status.capture.paused ? "resume" : "pause");
    toastMsg(status.capture.paused ? "Capture resumed" : "Capture paused for an hour");
    bump();
  };
  const quit = async () => {
    setMenuOpen(false);
    const t = tauri();
    if (t?.core) await t.core.invoke("quit_app");
    else toastMsg("Quit is only available in the desktop app");
  };
  const Item = ({ p, icon, label, count }: { p: Page; icon: React.ReactNode; label: string; count?: string | number }) => (
    <button className="item" data-page={p} aria-current={page === p ? "page" : undefined} onClick={() => go(p)}>
      {icon}
      {label}
      {count !== undefined ? <span className="cnt">{count}</span> : null}
    </button>
  );
  return (
    <nav className="sb" aria-label="Primary">
      <div className="wsmenu" ref={menuRef}>
      <button className="wsbtn" id="wsBtn" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
        <svg className="mark" viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="bl-tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7B86E4"/><stop offset="1" stopColor="#4D57B8"/></linearGradient></defs><rect width="100" height="100" rx="24" fill="url(#bl-tile)"/><g transform="translate(14 14) scale(.72)"><g fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth="12"><path d="M 24 20 H 50 A 13 13 0 0 1 50 46 H 24" opacity=".45"/><path d="M 24 46 H 56 A 18 18 0 0 1 56 82 H 24"/><path d="M 24 18 V 82"/></g><circle cx="82" cy="78" r="7.5" fill="#FFFFFF"/></g></svg>Brainlogs<IcChev /><span className="u">{status?.user.initials ?? "··"}</span>
      </button>
      {menuOpen ? (
        <div className="menu" role="menu" id="wsMenu">
          <div className="mi static">Brainlogs {status?.version ? `v${status.version}` : ""}<span className="sub">{status ? `${status.user.name} · ${status.dataDir}` : ""}</span></div>
          <button className="mi" role="menuitem" onClick={checkUpdates}>Check for updates</button>
          <button className="mi" role="menuitem" onClick={toggleCapture}>{status?.capture.paused ? "Resume capture" : "Pause capture for 1 hour"}</button>
          <button className="mi" role="menuitem" onClick={() => { setMenuOpen(false); go("privacy"); }}>Data &amp; retention</button>
          <button className="mi" role="menuitem" onClick={() => { setMenuOpen(false); go("audit"); }}>Audit log</button>
          <div className="sep" />
          <button className="mi danger" role="menuitem" onClick={quit}>Quit Brainlogs</button>
        </div>
      ) : null}
      </div>
      <button className="sb-search" id="openPal" onClick={openPalette}>
        <IcSearch />Search or jump to<kbd>⌘K</kbd>
      </button>
      <Item p="overview" icon={<IcPulse />} label="Overview" />
      <Item p="memory" icon={<IcMemory />} label="Memory" count={status ? compact(status.counts.events) : undefined} />
      <Item p="commitments" icon={<IcCheck />} label="Commitments" count={status?.counts.commitmentsOpen} />
      {(() => {
        const people = entities.filter((e) => e.kind === "person" && looksLikePersonName(e.name));
        const projects = entities.filter((e) => e.kind === "repo" || e.kind === "project" || e.kind === "branch" || e.kind === "org");
        const short = (e: Entity) => (e.kind === "repo" ? e.name.split("/").pop() ?? e.name : e.name);
        const Group = ({ title, items }: { title: string; items: Entity[] }) =>
          items.length ? (
            <div className="sbsec">
              <div className="sbh">{title}</div>
              {items.map((e) => (
                <button key={e.id} className="item ent" data-q={e.name} title={`${e.kind}: ${e.name} · ${e.mentionCount} mentions`} onClick={() => { setFilter({ kind: "text", q: e.name }); go("memory"); }}>
                  <i className="dotc" style={{ background: KIND_COLOR[e.kind] }} /><span className="name">{short(e)}</span><span className="cnt">{e.mentionCount}</span>
                </button>
              ))}
            </div>
          ) : null;
        return (
          <>
            <Group title="People" items={people} />
            <Group title="Top screens" items={projects} />
            {entities.length === 0 ? <div className="sbsec"><div className="sbh">Top screens</div><div className="stat">Nothing extracted yet</div></div> : null}
          </>
        );
      })()}
      <div className="sbsec">
        <div className="sbh">Governance</div>
        <Item p="audit" icon={<IcAudit />} label="Audit log" />
        <Item p="privacy" icon={<IcShield />} label="Data & retention" />
      </div>
      <div className="bottom">
        {upd.available ? (
          <button className="upd" id="updBtn" disabled={upd.phase === "downloading" || upd.phase === "ready"} onClick={upd.install} title={upd.available.body ?? undefined}>
            {upd.phase === "downloading" ? "Downloading update…" : upd.phase === "ready" ? "Restarting…" : upd.phase === "error" ? `Update failed: ${upd.error ?? "retry"}` : `Update to ${upd.available.version} · restart`}
          </button>
        ) : null}
        <div className="stat" id="capStat" data-tone={health.tone}><i className={health.tone === "ok" ? "" : health.tone} /><span className="k">{health.label}</span></div>
        <div className="kv">
          <span className="k">Model</span><span className="v">{status ? (status.ollama ? status.modelName : "none") : "…"}</span>
          <span className="k">Memory</span><span className="v">{status ? bytes(status.dbSizeBytes) : "…"}</span>
          <span className="k">Retention</span><span className="v">{status ? `${status.retentionDays} days` : "…"}</span>
        </div>
      </div>
    </nav>
  );
}
