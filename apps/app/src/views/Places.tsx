import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import type { PlaceKind, PlaceSummary } from "../lib/types";
import { hours } from "../lib/format";
import { useStore } from "../state/store";
import { Header } from "../components/Header";
import { PlaceDetail } from "./PlaceDetail";

const KIND_LABEL: Record<PlaceKind, string> = { doc: "Docs", person: "People", repo: "Repos", site: "Sites", call: "Calls", app: "Apps" };
const KIND_COLOR: Record<PlaceKind, string> = { doc: "var(--brand)", person: "var(--purple)", repo: "var(--amber)", site: "var(--teal)", call: "var(--green)", app: "var(--t4)" };

function ago(ts: string, now: number): string {
  const m = Math.round((now - Date.parse(ts)) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

/** Everything Brainlogs knows, grouped by the thing you return to rather than by time. */
export function Places() {
  const { version, placeKey, openPlace } = useStore();
  const [kind, setKind] = useState<PlaceKind | "all">("all");
  const [days, setDays] = useState(30);
  const list = useAsync(() => api.places(days, kind === "all" ? undefined : kind), [version, kind, days]);
  const now = Date.now();
  const rows = list.data ?? [];
  const kinds = useMemo(() => {
    const seen = new Map<PlaceKind, number>();
    for (const p of rows) seen.set(p.kind, (seen.get(p.kind) ?? 0) + 1);
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const maxWeek = Math.max(1, ...rows.flatMap((p) => p.week));

  if (placeKey) return <PlaceDetail placeKey={placeKey} onBack={() => openPlace(null)} />;

  return (
    <>
      <Header right={<button className="tb outl" onClick={() => setDays((d) => (d === 30 ? 90 : 30))}>{days === 30 ? "Last 30 days" : "Last 90 days"}</button>} />
      <div className="pg-wrap">
        <div className="pg wide">
          <h1>Everything you know</h1>
          <p className="sub">Places you return to: documents, people, repositories and sites. Each card is what Brainlogs would tell you if you went there right now.</p>
          <div className="fbar" style={{ padding: "0 0 14px", border: 0, position: "static" }}>
            <button className={`pchip${kind === "all" ? " on" : ""}`} onClick={() => setKind("all")}>All<span>{rows.length}</span></button>
            {kinds.map(([k, n]) => (
              <button key={k} className={`pchip${kind === k ? " on" : ""}`} onClick={() => setKind(k)}>
                <i style={{ background: KIND_COLOR[k] }} />{KIND_LABEL[k]}<span>{n}</span>
              </button>
            ))}
            <span className="sp" />
            <span className="pill">{list.loading ? "Loading…" : `${rows.length} places`}</span>
          </div>
          {list.error ? <div className="err">{list.error}</div> : null}
          {!list.loading && rows.length === 0 ? <div className="empty">Nothing recognised yet. Places appear once you visit the same document, person or repository twice.</div> : null}
          <div className="pgrid">
            {rows.map((p: PlaceSummary) => (
              <button key={p.key} className="pcard" onClick={() => openPlace(p.key)} style={{ ["--pk" as string]: KIND_COLOR[p.kind] }}>
                <div className="n">{p.label}</div>
                <div className="w">{p.where} · {p.visits} visit{p.visits === 1 ? "" : "s"} · {ago(p.lastSeen, now)}</div>
                <div className="spark" aria-hidden>
                  {p.week.map((v, i) => <i key={i} style={{ height: `${Math.max(8, (v / maxWeek) * 100)}%`, opacity: v ? 1 : 0.25 }} />)}
                </div>
                <div className="tot">{hours(p.totalMs)} total</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
