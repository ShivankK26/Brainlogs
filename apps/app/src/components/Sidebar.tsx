import type { Entity, Status } from "../lib/types";
import { KIND_COLOR, bytes, compact } from "../lib/format";
import { useStore, type Page } from "../state/store";
import { IcAgent, IcAudit, IcCheck, IcChev, IcMemory, IcPulse, IcSearch, IcShield } from "./Icons";

export function Sidebar({ status, entities }: { status: Status | null; entities: Entity[] }) {
  const { page, go, openPalette, setFilter } = useStore();
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
        <span className="mark">B</span>Brainlog<IcChev /><span className="u">{status?.user.initials ?? "··"}</span>
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
        <div className="stat"><i className={status?.capture.paused ? "off" : ""} />{status?.capture.paused ? "Capture paused" : "Capture active"} · all data on this device</div>
        <div className="stat" style={{ paddingTop: 0 }}>
          {status ? `${status.ollama ? "Local model" : "No local model"} · ${bytes(status.dbSizeBytes)} · ${status.retentionDays} days` : "Connecting…"}
        </div>
      </div>
    </nav>
  );
}
