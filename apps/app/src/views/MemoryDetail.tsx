import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import type { Commitment, Event } from "../lib/types";
import { STATUS_LABEL, dayLabel, dateLabel, eventPriority, eventStatus, memId, relMinutes, sourceLabel, timeLabel } from "../lib/format";
import { useStore } from "../state/store";
import { EntityLbls, Pri, St } from "../components/Bits";

function linked(e: Event, all: Commitment[]): Commitment[] {
  return all.filter((c) => c.evidenceEventIds.some((r) => (typeof r === "string" ? r : r.eventId) === e.id) || c.closedByEventId === e.id);
}

/** Collapse the "after" timeline into app switches: one entry per run of the same app. */
function activityAfter(focus: Event, after: Event[]): Array<{ text: string; at: string }> {
  const out: Array<{ text: string; at: string }> = [];
  let lastApp = focus.app;
  for (const e of after) {
    if (e.app === lastApp) continue;
    out.push({ text: `switched to ${e.app}${e.windowTitle ? ` — ${e.windowTitle}` : ""}`, at: e.ts });
    lastApp = e.app;
    if (out.length >= 6) break;
  }
  return out;
}

export function MemoryDetail({ id, commitments }: { id: string; commitments: Commitment[] }) {
  const { select, toastMsg, version } = useStore();
  const m = useAsync(() => api.moment(id), [id, version]);
  if (m.error) return <div className="err">{m.error}</div>;
  if (!m.data) return <div className="idle">Loading…</div>;
  const e = m.data.focus;
  const entities = m.data.entities;
  const lk = linked(e, commitments);
  const st = eventStatus(e, lk);
  const pri = eventPriority(e, lk);
  const after = activityAfter(e, m.data.after);
  return (
    <>
      <div className="dhd">
        {memId(e.id)}
        <span className="right">
          <button className="tb" onClick={() => { navigator.clipboard?.writeText(e.id); toastMsg("Event id copied"); }}>Copy id</button>
        </span>
      </div>
      <div className="dbody">
        <h2 className="dtitle">{sourceLabel(e)}</h2>
        <p className="dtext">{e.text}</p>
        <div className="props">
          <span className="k">Status</span><span className="v"><span className="pv"><St s={st} />{STATUS_LABEL[st]}</span></span>
          <span className="k">Priority</span><span className="v"><span className="pv"><Pri p={pri} />{pri[0]!.toUpperCase() + pri.slice(1)}</span></span>
          <span className="k">Source</span><span className="v"><span className="pv">{e.app} · {e.windowTitle || e.domain || e.sourceKind}</span></span>
          <span className="k">Captured</span><span className="v"><span className="pv">{dayLabel(e.ts)}, {timeLabel(e.ts)}</span></span>
          <span className="k">Sensitivity</span><span className="v"><span className="pv">{e.sensitivity === "none" ? "None" : e.sensitivity.replace(/_/g, " ")}</span></span>
          <span className="k">Entities</span><span className="v">{entities.length ? <EntityLbls entities={entities} max={6} /> : <span className="pv" style={{ color: "var(--t3)" }}>Not linked yet</span>}</span>
        </div>
        <div className="sec">Also on screen</div>
        <button className="win f"><span className="ap">{e.app[0]}</span><div><div className="n">{e.app}</div><small>{e.windowTitle || e.url || "—"}</small></div></button>
        {m.data.alsoOnScreen.slice(0, 5).map((w) => (
          <button key={w.id} className="win" onClick={() => select(w.id)}><span className="ap">{w.app[0]}</span><div><div className="n">{w.app}</div><small>{w.windowTitle || w.url || "—"}</small></div></button>
        ))}
        {m.data.alsoOnScreen.length === 0 ? <div className="idle" style={{ padding: "8px 0" }}>Nothing else was captured within 15 minutes.</div> : null}
        <div className="sec">Activity after</div>
        <div className="act">
          {after.length === 0 ? <div className="ev">No activity captured after this.</div> : null}
          {after.map((a, i) => (
            <div key={i} className="ev"><b>You</b> {a.text}<span>{relMinutes(e.ts, a.at)}</span></div>
          ))}
        </div>
        <div className="prov">
          Event {memId(e.id)} · retained until {dateLabel(e.expiresAt)}{lk.length ? ` · evidence for ${lk.length} commitment${lk.length > 1 ? "s" : ""}` : ""} · {e.sourceKind} capture
        </div>
      </div>
    </>
  );
}
