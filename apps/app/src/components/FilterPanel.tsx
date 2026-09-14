import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import type { QueryFilter } from "../state/store";

type Draft = Omit<QueryFilter, "kind">;

const EMPTY: Draft = { q: "" };

/** Pieces of a query filter, for the chip in the filter bar. */
export function describeQuery(f: QueryFilter): string {
  const parts: string[] = [];
  if (f.q) parts.push(`“${f.q}”`);
  if (f.app) parts.push(`app: ${f.app}`);
  if (f.domain) parts.push(f.domain);
  if (f.person) parts.push(`with ${f.person}`);
  if (f.repo) parts.push(f.repo);
  if (f.from || f.to) parts.push(`${f.from ?? "…"} → ${f.to ?? "now"}`);
  return parts.join(" · ") || "All events";
}

/** Popover under the Filter button: free text plus app, domain, person, repo and a date range. */
export function FilterPanel({ current, onApply, onClose }: { current: QueryFilter | null; onApply: (f: QueryFilter | null) => void; onClose: () => void }) {
  const [d, setD] = useState<Draft>(current ? { ...current } : EMPTY);
  const facets = useAsync(() => api.facets(30), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const set = (k: keyof Draft, v: string) => setD((x) => ({ ...x, [k]: v || undefined }));
  const apply = () => {
    const clean: Draft = { q: (d.q ?? "").trim() };
    for (const k of ["app", "domain", "person", "repo", "from", "to"] as const) if (d[k]) clean[k] = d[k];
    const any = clean.q || clean.app || clean.domain || clean.person || clean.repo || clean.from || clean.to;
    onApply(any ? { kind: "query", ...clean } : null);
    onClose();
  };
  const Sel = ({ k, label, options }: { k: "app" | "domain"; label: string; options: Array<{ name: string; count: number }> }) => (
    <label className="ff">
      <span>{label}</span>
      <select value={d[k] ?? ""} onChange={(e) => set(k, e.target.value)}>
        <option value="">Any</option>
        {d[k] && !options.some((o) => o.name === d[k]) ? <option value={d[k]}>{d[k]}</option> : null}
        {options.map((o) => <option key={o.name} value={o.name}>{o.name} ({o.count})</option>)}
      </select>
    </label>
  );
  return (
    <div className="fpanel" id="filterPanel" role="dialog" aria-label="Filter memory" onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "SELECT") apply(); }}>
      <label className="ff wide"><span>Contains</span><input id="fq" autoFocus placeholder="words in the title or on-screen text" value={d.q ?? ""} onChange={(e) => set("q", e.target.value)} /></label>
      <div className="frow">
        <Sel k="app" label="App" options={facets.data?.apps ?? []} />
        <Sel k="domain" label="Domain" options={facets.data?.domains ?? []} />
      </div>
      <div className="frow">
        <label className="ff"><span>Person</span><input id="fperson" placeholder="name" value={d.person ?? ""} onChange={(e) => set("person", e.target.value)} /></label>
        <label className="ff"><span>Repo or branch</span><input id="frepo" placeholder="owner/repo or feat/…" value={d.repo ?? ""} onChange={(e) => set("repo", e.target.value)} /></label>
      </div>
      <div className="frow">
        <label className="ff"><span>From</span><input type="date" value={d.from ?? ""} onChange={(e) => set("from", e.target.value)} /></label>
        <label className="ff"><span>To</span><input type="date" value={d.to ?? ""} onChange={(e) => set("to", e.target.value)} /></label>
      </div>
      <div className="facts">
        <button className="tb outl" id="fclear" onClick={() => { setD(EMPTY); onApply(null); onClose(); }}>Clear</button>
        <span className="sp" />
        <button className="tb outl" onClick={onClose}>Cancel</button>
        <button className="tb primary" id="fapply" onClick={apply}>Apply</button>
      </div>
    </div>
  );
}
