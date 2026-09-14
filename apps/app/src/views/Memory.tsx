import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import type { AskResult, Commitment, Entity, Event, Highlight } from "../lib/types";
import { dayKey, dayLabel, eventPriority, eventStatus, eventTitle, initialsOf, memId, timeLabel } from "../lib/format";
import { useStore } from "../state/store";
import { Header } from "../components/Header";
import { EntityLbls, Marked, Pri, St } from "../components/Bits";
import { IcFilter } from "../components/Icons";
import { MemoryDetail } from "./MemoryDetail";

type Row = { event: Event; entities: Entity[]; highlight?: Highlight };

const VIA_LABEL: Record<AskResult["via"], string> = { cloud: "Answered by Claude", local: "Answered by the local model", none: "No model available" };

/** Answer text with `[n]` markers turned into buttons that select the cited moment. */
function AskCard({ question, result, loading, onCite }: { question: string; result: AskResult | null; loading: boolean; onCite: (id: string) => void }) {
  const lines = result ? result.answer.split("\n") : [];
  return (
    <div className="askcard" id="askCard">
      <div className="q">{question}</div>
      {loading ? <div className="a thinking">Thinking…</div> : null}
      {result ? (
        <>
          <div className="a">
            {lines.map((line, i) => (
              <p key={i}>
                {line.split(/(\[\d+\])/).map((part, j) => {
                  const m = /^\[(\d+)\]$/.exec(part);
                  const id = m ? result.citations[Number(m[1]) - 1] : undefined;
                  return id ? <button key={j} className="cite" onClick={() => onCite(id)}>{part}</button> : <span key={j}>{part}</span>;
                })}
              </p>
            ))}
          </div>
          <div className="m">
            {VIA_LABEL[result.via]}{result.via !== "none" ? ` (${result.model})` : ""} · {result.citations.length} cited
            {result.withheld ? ` · ${result.withheld} sensitive moment${result.withheld === 1 ? "" : "s"} kept off the cloud` : ""}
          </div>
        </>
      ) : null}
    </div>
  );
}

function linkedCommitments(e: Event, all: Commitment[]): Commitment[] {
  return all.filter((c) => c.evidenceEventIds.some((r) => (typeof r === "string" ? r : r.eventId) === e.id) || c.closedByEventId === e.id);
}

export function Memory() {
  const { filter, setFilter, selected, select, openPalette, version, userInitials } = useStore();
  const [days, setDays] = useState(7);
  const [askRes, setAskRes] = useState<AskResult | null>(null);
  useEffect(() => setAskRes(null), [filter]);

  const rows = useAsync<Row[]>(async () => {
    if (filter?.kind === "text") {
      const r = await api.search(filter.q, 100);
      return r.hits.map((h) => ({ event: h.event, entities: h.entities, highlight: h.highlights[0] }));
    }
    if (filter?.kind === "ask") {
      const a = await api.ask(filter.q);
      setAskRes(a);
      const evs = await api.eventsByIds(a.citations);
      return evs.map((event) => ({ event, entities: [] }));
    }
    if (filter?.kind === "ids") {
      const evs = await api.eventsByIds(filter.ids);
      return evs.map((event) => ({ event, entities: [] }));
    }
    const to = new Date().toISOString();
    const from = new Date(Date.now() - days * 86_400_000).toISOString();
    const t = await api.timeline(from, to, 2000);
    return [...t.events].reverse().map((event) => ({ event, entities: t.entities[event.id] ?? [] }));
  }, [filter, days, version]);
  const commitments = useAsync(() => api.commitments(), [version]);
  const cmts = commitments.data ?? [];
  const list = rows.data ?? [];

  const groups = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of list) {
      const k = dayKey(r.event.ts);
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()];
  }, [list]);

  // keyboard: j/k or arrows move the selection, Esc clears the filter
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (document.getElementById("ov")) return;
      const ids = list.map((r) => r.event.id);
      const i = ids.indexOf(selected ?? "");
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        const n = ids[Math.min(i + 1, ids.length - 1)];
        if (n) select(n);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        const n = ids[Math.max(i - 1, 0)];
        if (n) select(n);
      } else if (e.key === "Enter" && i < 0 && ids[0]) {
        select(ids[0]);
      } else if (e.key === "Escape" && filter) {
        setFilter(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [list, selected, select, filter, setFilter]);

  useEffect(() => {
    if (!selected) return;
    document.querySelector<HTMLElement>(`.row[data-id="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const chipLabel = filter?.kind === "text" ? filter.q : filter?.kind === "ask" ? `Ask: ${filter.q}` : filter?.kind === "ids" ? filter.label : null;

  return (
    <>
      <Header right={<button className="tb outl" onClick={() => setDays((d) => (d === 7 ? 30 : 7))}>{days === 7 ? "Last 7 days" : "Last 30 days"}</button>} />
      <div className="body" id="memBody">
        <div className="list">
          <div className="fbar">
            <button className="tb outl" id="filterBtn" onClick={openPalette}><IcFilter />Filter</button>
            {chipLabel ? <button className="chip" id="clearF" onClick={() => setFilter(null)}>{chipLabel}<span className="x">✕</span></button> : null}
            <span className="sp" />
            <span className="pill">{rows.loading ? "Loading…" : list.length >= 2000 && !filter ? `newest ${list.length} events` : `${list.length} events`}</span>
          </div>
          <div id="rows">
            {rows.error ? <div className="err">{rows.error}</div> : null}
            {filter?.kind === "ask" ? <AskCard question={filter.q} result={askRes} loading={rows.loading && !askRes} onCite={select} /> : null}
            {!rows.loading && list.length === 0 && filter?.kind !== "ask" ? (
              <div className="empty">{filter ? <>No events match. Press <kbd>⌘K</kbd> to search across everything.</> : <>Nothing captured in the last {days} days. Start the desktop app to begin capturing.</>}</div>
            ) : null}
            {groups.map(([day, rs]) => (
              <div key={day}>
                <div className="grp">{dayLabel(rs[0]!.event.ts)}<span className="cnt">{rs.length}</span><span className="plus">+</span></div>
                {rs.map(({ event: e, entities, highlight }) => {
                  const linked = linkedCommitments(e, cmts);
                  const who = entities.find((x) => x.kind === "person");
                  return (
                    <button key={e.id} className="row" data-id={e.id} aria-selected={e.id === selected} onClick={() => select(e.id)}>
                      <St s={eventStatus(e, linked)} />
                      <span className="id">{memId(e.id)}</span>
                      <span className="ttl">{highlight ? <Marked text={highlight.snippet} matches={highlight.matches} /> : eventTitle(e)}</span>
                      <span className="meta">
                        <Pri p={eventPriority(e, linked)} />
                        <EntityLbls entities={entities} />
                        <span>{e.app}</span>
                        <span className="av">{who ? initialsOf(who.name) : userInitials || "··"}</span>
                        <span>{timeLabel(e.ts)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <aside className="detail" id="detail">
          {selected ? <MemoryDetail id={selected} commitments={cmts} /> : <div className="idle">Select an event, or press <kbd>↑</kbd> <kbd>↓</kbd> to move and <kbd>↵</kbd> to open.</div>}
        </aside>
      </div>
    </>
  );
}
