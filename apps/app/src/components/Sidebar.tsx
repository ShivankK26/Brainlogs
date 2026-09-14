import type { Entity, Status } from "../lib/types";
import { KIND_COLOR, bytes, compact } from "../lib/format";
import { useStore, type Page } from "../state/store";
import { useUpdater } from "../lib/updater";
import { IcAgent, IcAudit, IcCheck, IcChev, IcMemory, IcPulse, IcSearch, IcShield } from "./Icons";

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
  const Item = ({ p, icon, label, count }: { p: Page; icon: React.ReactNode; label: string; count?: string | number }) => (
    <button className="item" data-page={p} aria-current={page === p ? "page" : undefined} onClick={() => go(p)}>
      {icon}
      {label}
      {count !== undefined ? <span className="cnt">{count}</span> : null}
    </button>
  );
  return (
    <nav className="sb" aria-label="Primary">
      <button className="wsbtn">
        <svg className="mark" viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="bl-tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7B86E4"/><stop offset="1" stopColor="#4D57B8"/></linearGradient></defs><rect width="100" height="100" rx="24" fill="url(#bl-tile)"/><g transform="translate(14 14) scale(.72)"><g fill="none" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth="12"><path d="M 24 20 H 50 A 13 13 0 0 1 50 46 H 24" opacity=".45"/><path d="M 24 46 H 56 A 18 18 0 0 1 56 82 H 24"/><path d="M 24 18 V 82"/></g><circle cx="82" cy="78" r="7.5" fill="#FFFFFF"/></g></svg>Brainlogs<IcChev /><span className="u">{status?.user.initials ?? "··"}</span>
      </button>
      <button className="sb-search" id="openPal" onClick={openPalette}>
        <IcSearch />Search or jump to<kbd>⌘K</kbd>
      </button>
      <Item p="overview" icon={<IcPulse />} label="Pulse" />
      <Item p="memory" icon={<IcMemory />} label="Memory" count={status ? compact(status.counts.events) : undefined} />
      <Item p="commitments" icon={<IcCheck />} label="Commitments" count={status?.counts.commitmentsOpen} />
      <Item p="agents" icon={<IcAgent />} label="Agents" count={status?.agents.length} />
      <div className="sbsec">
        <div className="sbh">Entities</div>
        {entities.length === 0 ? <div className="stat">No entities yet</div> : null}
        {entities.map((e) => (
          <button key={e.id} className="item ent" data-q={e.name} onClick={() => { setFilter({ kind: "text", q: e.name }); go("memory"); }}>
            <i className="dotc" style={{ background: KIND_COLOR[e.kind] }} /><span className="name">{e.name}</span><span className="cnt">{e.mentionCount}</span>
          </button>
        ))}
      </div>
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
        <div className="stat" id="capStat" data-tone={health.tone}><i className={health.tone === "ok" ? "" : health.tone} />{health.label} · all data on this device</div>
        <div className="stat" style={{ paddingTop: 0 }}>
          {status ? `${status.ollama ? "Local model" : "No local model"} · ${bytes(status.dbSizeBytes)} · ${status.retentionDays} days` : "Connecting…"}
        </div>
      </div>
    </nav>
  );
}
