import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { Recall } from "../lib/types";

type Front = { app: string; title: string; exe: string };
type Tauri = { core?: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> } };
const tauri = (): Tauri | undefined => (window as unknown as { __TAURI__?: Tauri }).__TAURI__;
const invoke = async (cmd: string, args?: Record<string, unknown>) => {
  const t = tauri();
  return t?.core ? t.core.invoke(cmd, args) : undefined;
};

const POLL_MS = 1500;
const SHOW_MS = 8000;

function ago(ts: string | null, now: number): string {
  if (!ts) return "never";
  const m = Math.round((now - Date.parse(ts)) / 60_000);
  if (m < 2) return "just now";
  if (m < 60) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
const KIND_TAG: Record<string, string> = { doc: "DOC", person: "WHO", repo: "REPO", site: "WEB", call: "CALL", app: "APP" };
const FACT_GLYPH: Record<string, string> = { decision: "✓", question: "?", promise: "→" };

/**
 * The recall strip: a borderless always-on-top window that follows the front app and says what
 * Brainlogs already knows about it. It speaks only when it has something specific, and never
 * takes focus. Rendered by the desktop shell at `/?strip=1`.
 */
export function RecallStrip() {
  const [r, setR] = useState<Recall | null>(null);
  const lastKey = useRef<string | null>(null);
  const dismissed = useRef<Set<string>>(new Set());
  const hideAt = useRef<number>(0);
  const box = useRef<HTMLDivElement>(null);

  const hide = useCallback(() => {
    hideAt.current = 0;
    setR(null);
    void invoke("recall_hide");
  }, []);

  // Poll the front window; when the place changes, ask the core what it knows.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const front = (await invoke("current_window")) as Front | null | undefined;
      if (!alive) return;
      if (!front || !front.title) return;
      const probe = `${front.app}|${front.title}`;
      if (probe === lastKey.current) {
        if (hideAt.current && Date.now() > hideAt.current) hide();
        return;
      }
      lastKey.current = probe;
      let got: Recall | null = null;
      try {
        const res = await api.recall({ app: front.app, title: front.title });
        got = "place" in res && res.place ? (res as Recall) : null;
      } catch {
        got = null;
      }
      if (!alive) return;
      // Speak only when there is something worth saying: a return visit, a change, or a fact.
      const worth = got && (got.visits > 1 || got.change?.summary || got.facts.length > 0);
      if (!worth || !got || dismissed.current.has(got.place.key)) {
        hide();
        return;
      }
      setR(got);
      hideAt.current = Date.now() + SHOW_MS;
    };
    void tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [hide]);

  // Size the window to the content, then show it.
  useEffect(() => {
    if (!r) return;
    const h = Math.ceil((box.current?.getBoundingClientRect().height ?? 180) + 8);
    void invoke("recall_show", { height: h });
  }, [r]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && r) {
        dismissed.current.add(r.place.key);
        hide();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [r, hide]);

  if (!r) return null;
  const now = Date.now();
  const facts = r.facts.slice(0, 2);

  return (
    <div className="strip" ref={box} data-kind={r.place.kind}>
      <div className="edge" />
      <div className="sh">
        <span className="ic">{KIND_TAG[r.place.kind] ?? "APP"}</span>
        <span className="lb">{r.visits > 1 ? "you've been here before" : "what you know"}</span>
        <button className="x" onClick={() => { dismissed.current.add(r.place.key); hide(); }}>esc</button>
      </div>
      <div className="body">
        <h3>{r.place.label}</h3>
        <div className="sub">{r.place.where} · {r.visits} visit{r.visits === 1 ? "" : "s"} · last {ago(r.lastSeen, now)}</div>
        {r.change?.summary ? <div className="ln diff"><span className="g">Δ</span><span>{r.change.summary}</span></div> : null}
        {facts.map((f, i) => (
          <div key={i} className={`ln${f.kind === "question" ? " warn" : ""}`}>
            <span className="g">{FACT_GLYPH[f.kind]}</span>
            <span>{f.text}</span>
          </div>
        ))}
        {!r.change?.summary && facts.length === 0 ? (
          <div className="ln"><span className="g">◷</span><span>Nothing new since your last visit.</span></div>
        ) : null}
      </div>
    </div>
  );
}
