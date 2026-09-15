import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { dateLabelUTC, hours } from "../lib/format";
import type { Pulse } from "../lib/types";
import { useStore } from "../state/store";
import { Header } from "../components/Header";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "0%";
}
function delta(cur: number, prev: number): { text: string; tone: "up" | "down" | "flat" } | null {
  if (prev <= 0) return null;
  const r = (cur - prev) / prev;
  if (Math.abs(r) < 0.03) return { text: "same as last week", tone: "flat" };
  return { text: `${r > 0 ? "+" : "−"}${Math.round(Math.abs(r) * 100)}% vs last week`, tone: r > 0 ? "up" : "down" };
}
function clock(ts: string | null): string {
  return ts ? new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—";
}
function dayLabel(ts: string): string {
  return new Date(ts).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** A number with its label and a comparison line; the `.kp .v` hook is what the e2e suite reads. */
function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "up" | "down" | "flat" }) {
  return (
    <div className="kpi">
      <div className="l">{label}</div>
      <div className="v">{value}</div>
      {sub ? <div className={`d ${tone ?? ""}`}>{sub}</div> : null}
    </div>
  );
}

/** Facts worth reading, each with the evidence a click away. Built from measures, not prose. */
function highlights(p: Pulse): Array<{ text: string; eventId?: string; ids?: string[] }> {
  const out: Array<{ text: string; eventId?: string }> = [];
  const top = p.timeByProject[0];
  if (top && p.focusedMs > 0) out.push({ text: `${top.name} took ${pct(top.ms, p.focusedMs)} of your focused time (${hours(top.ms)}).` });
  const best = [...p.days].sort((a, b) => b.focusedMs - a.focusedMs)[0];
  if (best && best.focusedMs > 0) out.push({ text: `Most focused day: ${dayLabel(best.date + "T12:00:00")}, ${hours(best.focusedMs)} across ${best.sessions} sessions.` });
  if (p.longestSession) out.push({ text: `Longest stretch: ${hours(p.longestSession.ms)} in ${p.longestSession.app} (${p.longestSession.title.slice(0, 60)}${p.longestSession.title.length > 60 ? "…" : ""}), ${dayLabel(p.longestSession.start)}.`, eventId: p.longestSession.eventId });
  if (p.people.length) out.push({ text: `Conversations with ${p.people.slice(0, 3).map((x) => x.name).join(", ")}${p.people.length > 3 ? ` and ${p.people.length - 3} more` : ""}.` });
  if (p.commitments.overdue > 0) out.push({ text: `${p.commitments.overdue} commitment${p.commitments.overdue === 1 ? " is" : "s are"} overdue.` });
  const d = delta(p.contextSwitches, p.previous.contextSwitches);
  if (p.contextSwitches > 0 && d && d.tone !== "flat") out.push({ text: `App switching ${d.tone === "up" ? "rose" : "fell"} ${d.text.replace(/ vs last week$/, "")} compared with last week.` });
  return out.slice(0, 5);
}

export function Overview() {
  const { version, setFilter, go, select } = useStore();
  const [weekOffset, setWeekOffset] = useState(0);
  const date = useMemo(() => new Date(Date.now() + weekOffset * 7 * 86_400_000).toISOString().slice(0, 10), [weekOffset]);
  const pulse = useAsync(() => api.pulse(date), [version, date]);
  const p = pulse.data;
  const range = p ? `${dateLabelUTC(p.weekStart)} – ${dateLabelUTC(new Date(Date.parse(p.weekEnd) - 1).toISOString())}` : "";
  const maxProj = Math.max(1, ...(p?.timeByProject.map((x) => x.ms) ?? [1]));
  const maxDay = Math.max(1, ...(p?.days.map((x) => x.focusedMs) ?? [1]));
  const todayKey = new Date().toISOString().slice(0, 10);
  const focusDelta = p ? delta(p.focusedMs, p.previous.focusedMs) : null;
  const switchDelta = p ? delta(p.contextSwitches, p.previous.contextSwitches) : null;
  const facts = p ? highlights(p) : [];
  const [showNarrative, setShowNarrative] = useState(false);

  const openEvent = (id: string) => {
    setFilter(null);
    go("memory");
    select(id);
  };
  const openProject = (name: string) => {
    setFilter({ kind: "text", q: name });
    go("memory");
  };
  const openDay = (dateKey: string) => {
    setFilter({ kind: "query", q: "", from: dateKey, to: dateKey });
    go("memory");
  };

  return (
    <>
      <Header
        right={
          <>
            <span className="range">{range}</span>
            <button className="tb outl" id="weekPrev" onClick={() => setWeekOffset((w) => w - 1)} aria-label="Previous week">←</button>
            <button className="tb outl" id="weekNext" onClick={() => setWeekOffset((w) => Math.min(0, w + 1))} disabled={weekOffset === 0} aria-label="Next week">→</button>
          </>
        }
      />
      <div className="pg-wrap">
        <div className="pg wide overview">
          <div className="ovh">
            <h1>{weekOffset === 0 ? "This week" : weekOffset === -1 ? "Last week" : `${-weekOffset} weeks ago`}</h1>
            {p ? <span className="sub">{p.activeDays} active day{p.activeDays === 1 ? "" : "s"} · {p.eventCount.toLocaleString()} captures · everything computed on this device</span> : null}
          </div>
          {pulse.error ? <div className="err">{pulse.error}</div> : null}

          <div className="kp">
            <Kpi label="Focused time" value={p ? hours(p.focusedMs) : "—"} sub={focusDelta?.text ?? (p ? `${p.sessions} sessions` : undefined)} tone={focusDelta?.tone} />
            <Kpi label="Top focus" value={p?.timeByProject[0] ? pct(p.timeByProject[0].ms, p.focusedMs) : "—"} sub={p?.timeByProject[0]?.name} />
            <Kpi label="App switches" value={p ? String(p.contextSwitches) : "—"} sub={switchDelta?.text ?? (p?.peakHours ? `mostly ${String(p.peakHours[0]).padStart(2, "0")}:00–${String(p.peakHours[1]).padStart(2, "0")}:00` : undefined)} tone={switchDelta ? (switchDelta.tone === "up" ? "down" : switchDelta.tone === "down" ? "up" : "flat") : undefined} />
            <Kpi label="Open commitments" value={p ? String(p.commitments.open) : "—"} sub={p ? (p.commitments.overdue ? `${p.commitments.overdue} overdue` : p.commitments.open ? "none overdue" : "nothing pending") : undefined} tone={p?.commitments.overdue ? "down" : undefined} />
          </div>

          <div className="ovgrid">
            <section className="panel">
              <div className="ph">Where the time went<span className="m">focused hours</span></div>
              <div className="pb bars" id="bars">
                {(p?.timeByProject ?? []).map((x) => (
                  <div key={x.name} style={{ display: "contents" }}>
                    <button className="n lnk" title={`Open ${x.name} in Memory`} onClick={() => openProject(x.name)}>{x.name}</button>
                    <div className="bar"><i style={{ width: `${(x.ms / maxProj) * 100}%` }} /></div>
                    <div className="h">{hours(x.ms)}<span className="pc">{p ? pct(x.ms, p.focusedMs) : ""}</span></div>
                  </div>
                ))}
                {p && p.timeByProject.length === 0 ? <div className="muted" style={{ gridColumn: "1 / -1" }}>No sessions this week.</div> : null}
              </div>
            </section>

            <section className="panel">
              <div className="ph">Daily rhythm<span className="m">focused time per day</span></div>
              <div className="pb rhythm">
                {(p?.days ?? []).map((d, i) => {
                  const isToday = d.date === todayKey;
                  const future = d.date > todayKey;
                  return (
                    <button key={d.date} className={`day${isToday ? " today" : ""}${future ? " future" : ""}`} disabled={d.focusedMs === 0} title={d.focusedMs ? `${hours(d.focusedMs)} · ${clock(d.firstTs)} – ${clock(d.lastTs)}` : "nothing captured"} onClick={() => openDay(d.date)}>
                      <span className="col"><i style={{ height: `${Math.max(d.focusedMs ? 4 : 0, (d.focusedMs / maxDay) * 100)}%` }} /></span>
                      <span className="dl">{DOW[i]}</span>
                      <span className="dv">{d.focusedMs ? hours(d.focusedMs) : "·"}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="panel">
              <div className="ph">Highlights<span className="m">click to see the evidence</span></div>
              <div className="pb">
                {facts.length === 0 ? <div className="muted">Nothing to report yet. Highlights appear once a few hours have been captured.</div> : null}
                <ul className="facts-list">
                  {facts.map((f, i) => (
                    <li key={i}>{f.eventId ? <button className="lnk" onClick={() => openEvent(f.eventId!)}>{f.text}</button> : f.text}</li>
                  ))}
                </ul>
                {p?.summary ? (
                  <div className="narr-toggle">
                    <button className="lnk dim" onClick={() => setShowNarrative((v) => !v)}>{showNarrative ? "Hide weekly narrative" : "Show weekly narrative"}</button>
                    {showNarrative ? <p className="narr-text">{p.summary.markdown.replace(/\*\*/g, "")}</p> : null}
                  </div>
                ) : null}
              </div>
            </section>

            <section className="panel">
              <div className="ph">People &amp; places<span className="m">this week</span></div>
              <div className="pb split">
                <div>
                  <div className="sh">Conversations</div>
                  {p && p.people.length === 0 ? <div className="muted">No chats or mail with a known person yet.</div> : null}
                  {(p?.people ?? []).map((x) => (
                    <button key={x.name} className="rowlink" onClick={() => openProject(x.name)}>
                      <span className="av">{x.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
                      <span className="t">{x.name}</span>
                      <span className="meta">{hours(x.ms)} · {dayLabel(x.lastTs)}</span>
                    </button>
                  ))}
                </div>
                <div>
                  <div className="sh">Top sites</div>
                  {p && p.topDomains.length === 0 ? <div className="muted">No browsing captured.</div> : null}
                  {(p?.topDomains ?? []).map((x) => (
                    <button key={x.name} className="rowlink" onClick={() => { setFilter({ kind: "query", q: "", domain: x.name }); go("memory"); }}>
                      <span className="t">{x.name}</span>
                      <span className="meta">{hours(x.ms)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
