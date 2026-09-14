import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { dateLabelUTC, hours } from "../lib/format";
import { useStore } from "../state/store";
import { Header } from "../components/Header";

/** `**name**` in the narrative marks an entity. */
function bold(s: string): React.ReactNode {
  const parts = s.split(/\*\*(.+?)\*\*/g);
  return parts.map((p, i) => (i % 2 === 1 ? <mark key={i}>{p}</mark> : p));
}

function splitSentences(md: string): string[] {
  return md.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
}

export function Pulse() {
  const { version, setFilter, go } = useStore();
  const [weekOffset, setWeekOffset] = useState(0);
  const date = useMemo(() => new Date(Date.now() + weekOffset * 7 * 86_400_000).toISOString().slice(0, 10), [weekOffset]);
  const pulse = useAsync(() => api.pulse(date), [version, date]);
  const p = pulse.data;
  const sentences = useMemo(() => (p?.summary ? splitSentences(p.summary.markdown) : []), [p?.summary]);
  const max = Math.max(1, ...(p?.timeByProject.map((x) => x.ms) ?? [1]));
  const range = p ? `${dateLabelUTC(p.weekStart)} – ${dateLabelUTC(new Date(Date.parse(p.weekEnd) - 1).toISOString())}` : "";
  const peak = p?.peakHours ? `peak ${String(p.peakHours[0]).padStart(2, "0")}:00–${String(p.peakHours[1]).padStart(2, "0")}:00` : "no switches yet";

  const openSentence = (i: number) => {
    const prov = p?.summary?.sentenceProvenance.find((x) => x.sentenceIdx === i);
    const ids = (prov?.eventIds ?? []).map((r) => (typeof r === "string" ? r : r.eventId));
    if (ids.length === 0) return;
    setFilter({ kind: "ids", ids, label: `Sentence ${i + 1} of this week's summary` });
    go("memory");
  };

  return (
    <>
      <Header
        right={
          <>
            <button className="tb outl" id="weekPrev" onClick={() => setWeekOffset((w) => w - 1)} aria-label="Previous week">←</button>
            <button className="tb outl" id="weekNext" onClick={() => setWeekOffset((w) => Math.min(0, w + 1))} disabled={weekOffset === 0} aria-label="Next week">→</button>
          </>
        }
      />
      <div className="pg-wrap">
        <div className="pg">
          <h1>{weekOffset === 0 ? "This week" : weekOffset === -1 ? "Last week" : ` weeks ago`}</h1>
          <p className="sub">Generated on this device from your activity timeline. Every sentence is linked to source events.</p>
          {pulse.error ? <div className="err">{pulse.error}</div> : null}
          <div className="kp">
            <div><div className="l">Focused time</div><div className="v">{p ? hours(p.focusedMs) : "—"}</div><div className="d">{p ? `${p.timeByProject.length} projects · ${p.sessions} sessions` : ""}</div></div>
            <div><div className="l">Open commitments</div><div className="v">{p?.commitments.open ?? "—"}</div><div className="d">{p ? `${p.commitments.overdue} overdue · ${p.commitments.stalled} stalled` : ""}</div></div>
            <div><div className="l">Context switches</div><div className="v">{p?.contextSwitches ?? "—"}</div><div className="d">{p ? peak : ""}</div></div>
            <div><div className="l">Agent queries</div><div className="v">{p?.agentQueries ?? "—"}</div><div className="d">{p ? `${p.writesToReview} writes to review` : ""}</div></div>
          </div>
          <div className="two">
            <div className="panel">
              <div className="ph">Summary<span className="m">{range}</span></div>
              <div className="pb narr">
                {sentences.length > 0 ? (
                  <p>
                    {sentences.map((s, i) => (
                      <span key={i} className="sent" role="button" tabIndex={0} title="Open the evidence for this sentence" onClick={() => openSentence(i)} onKeyDown={(e) => e.key === "Enter" && openSentence(i)}>
                        {bold(s)}{" "}
                      </span>
                    ))}
                  </p>
                ) : (
                  <p className="muted">
                    {p && p.eventCount > 0
                      ? "No narrative for this week yet. The graph job writes one from your timeline once entities and commitments are extracted."
                      : "Nothing captured this week yet. Brainlogs fills this in as you work."}
                  </p>
                )}
              </div>
            </div>
            <div className="panel">
              <div className="ph">Time by project</div>
              <div className="pb bars" id="bars">
                {(p?.timeByProject ?? []).map((x) => (
                  <div key={x.name} style={{ display: "contents" }}>
                    <div className="n" title={x.name}>{x.name}</div>
                    <div className="bar"><i style={{ width: `${(x.ms / max) * 100}%` }} /></div>
                    <div className="h">{hours(x.ms)}</div>
                  </div>
                ))}
                {p && p.timeByProject.length === 0 ? <div className="muted" style={{ gridColumn: "1 / -1", color: "var(--t3)" }}>No sessions this week.</div> : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
