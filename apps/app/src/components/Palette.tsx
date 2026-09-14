import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import type { SearchHit } from "../lib/types";
import { eventTitle, memId } from "../lib/format";
import { PAGE_TITLE, useStore, type Page } from "../state/store";
import { IcSearch } from "./Icons";
import { Marked } from "./Bits";

type Item = { key: string; node: React.ReactNode; s: "Search" | "Ask" | "Go to" | string; act: () => void };

/** Questions go to Ask first; plain terms keep the filter first so muscle memory (Enter = filter) holds. */
export function looksLikeQuestion(term: string): boolean {
  return /\?\s*$/.test(term) || /^(who|what|when|where|why|how|did|does|do|is|are|was|were|which|can|could|should|has|have)\b/i.test(term);
}

export function Palette() {
  const { paletteOpen, closePalette, go, setFilter, select } = useStore();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (paletteOpen) {
      setQ("");
      setIdx(0);
      setHits([]);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [paletteOpen]);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setHits([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      api.search(term, 6).then((r) => alive && setHits(r.hits), () => alive && setHits([]));
    }, 120);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  const items = useMemo<Item[]>(() => {
    const term = q.trim();
    const nav: Item[] = (Object.keys(PAGE_TITLE) as Page[])
      .filter((p) => !term || PAGE_TITLE[p].toLowerCase().includes(term.toLowerCase()))
      .map((p) => ({ key: `nav-${p}`, node: PAGE_TITLE[p], s: "Go to", act: () => go(p) }));
    const mem: Item[] = hits.map((h) => ({
      key: h.event.id,
      node: h.highlights[0] ? <Marked text={h.highlights[0].snippet} matches={h.highlights[0].matches} /> : eventTitle(h.event),
      s: memId(h.event.id),
      act: () => {
        setFilter(null);
        go("memory");
        select(h.event.id);
      },
    }));
    const filt: Item[] = term ? [{ key: "filter", node: `Filter memory by “${term}”`, s: "Search", act: () => { setFilter({ kind: "text", q: term }); go("memory"); } }] : [];
    const askIt: Item[] = term ? [{ key: "ask", node: `Ask Brainlogs: “${term}”`, s: "Ask", act: () => { setFilter({ kind: "ask", q: term }); go("memory"); } }] : [];
    return looksLikeQuestion(term) ? [...askIt, ...filt, ...mem, ...nav] : [...filt, ...mem, ...askIt, ...nav];
  }, [q, hits, go, setFilter, select]);

  useEffect(() => setIdx((i) => Math.min(i, Math.max(0, items.length - 1))), [items.length]);

  if (!paletteOpen) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") closePalette();
    else if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { const it = items[idx]; if (it) { it.act(); closePalette(); } }
  };

  let last = "";
  return (
    <div className="ov" id="ov" onMouseDown={(e) => { if (e.target === e.currentTarget) closePalette(); }}>
      <div className="pal" role="dialog" aria-label="Search">
        <div className="in"><IcSearch /><input ref={input} id="pq" placeholder="Search memory, people, projects…" autoComplete="off" value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }} onKeyDown={onKey} /></div>
        <div className="res" id="pres">
          {items.length === 0 ? <div className="rh">No results</div> : null}
          {items.map((it, i) => {
            const isAction = it.s === "Search" || it.s === "Ask";
            const lastIsAction = last === "Search" || last === "Ask";
            const head = (isAction && !lastIsAction) || (it.s === "Go to" && last !== "Go to") ? <div className="rh" key={`h-${it.key}`}>{it.s === "Go to" ? "Navigate" : "Actions"}</div> : null;
            last = it.s;
            return (
              <div key={it.key}>
                {head}
                <button className="ri" aria-selected={i === idx} onMouseEnter={() => setIdx(i)} onClick={() => { it.act(); closePalette(); }}>
                  <span className="t">{it.node}</span><span className="s">{it.s}</span>
                </button>
              </div>
            );
          })}
        </div>
        <div className="ft"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>
      </div>
    </div>
  );
}
