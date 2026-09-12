import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { SearchHit } from "../lib/types";
import { eventTitle, timeLabel, dayLabel } from "../lib/format";

/** Compact floating surface used by the desktop shell's small window. */
export function Widget() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  useEffect(() => {
    if (!q.trim()) return setHits([]);
    let alive = true;
    const t = setTimeout(() => api.search(q, 5).then((r) => alive && setHits(r.hits), () => alive && setHits([])), 150);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);
  return (
    <div className="widget">
      <input autoFocus placeholder="Ask your memory…" value={q} onChange={(e) => setQ(e.target.value)} />
      {hits.map((h) => (
        <div key={h.event.id} className="hit">{eventTitle(h.event)}<small>{h.event.app} · {dayLabel(h.event.ts)} {timeLabel(h.event.ts)}</small></div>
      ))}
      {q && hits.length === 0 ? <div className="hit" style={{ color: "var(--t3)" }}>No matches</div> : null}
    </div>
  );
}
