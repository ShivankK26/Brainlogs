import { useCallback, useEffect, useRef, useState } from "react";
import { screenIsShared } from "@brainlog/types";
import { api } from "../lib/api";
import type { Recall } from "../lib/types";

type Front = { app: string; title: string; exe: string; fullscreen?: boolean };
type Tauri = {
  core?: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
  event?: { listen: (name: string, cb: () => void) => Promise<() => void> };
};
const tauri = (): Tauri | undefined => (window as unknown as { __TAURI__?: Tauri }).__TAURI__;
const invoke = async (cmd: string, args?: Record<string, unknown>) => {
  const t = tauri();
  return t?.core ? t.core.invoke(cmd, args) : undefined;
};

const POLL_MS = 1500;
/** Eight seconds for a one-line card, two more per extra line, never longer than sixteen. */
function showMs(r: Recall): number {
  const lines = (r.change?.summary ? 1 : 0) + Math.min(2, r.facts.length) + Math.min(2, r.owed.length);
  return Math.min(16_000, 8_000 + 2_000 * Math.max(0, lines - 1));
}

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
function due(o: { status: string; dueAt: string | null }): string {
  if (o.status === "overdue") return "overdue";
  if (!o.dueAt) return o.status;
  const d = Math.round((Date.parse(o.dueAt) - Date.now()) / 86_400_000);
  if (d < 0) return "overdue";
  if (d === 0) return "due today";
  return d === 1 ? "due tomorrow" : `due in ${d} days`;
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

  // Ask what is in front, and when the place has changed ask the core what it knows about it.
  const tick = useCallback(async () => {
    const front = (await invoke("current_window")) as Front | null | undefined;
    if (!front || !front.title) return;
    if (screenIsShared(front)) {
      lastKey.current = null;
      hide();
      return;
    }
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
    // Speak only when there is something worth saying: a return visit, a change, or a fact.
    const worth = got && (got.visits > 1 || got.change?.summary || got.facts.length > 0 || got.owed.length > 0);
    if (!worth || !got || dismissed.current.has(got.place.key)) {
      hide();
      return;
    }
    setR(got);
    hideAt.current = Date.now() + showMs(got);
  }, [hide]);

  // Two ways in: the strip's own clock, and a nudge from the shell when the front window changes.
  // The nudge matters because a webview that is not on screen can have its timers throttled, and a
  // strip whose clock has stopped is a strip that never speaks again.
  useEffect(() => {
    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    let stop: (() => void) | undefined;
    void tauri()
      ?.event?.listen("recall-front", () => void tick())
      .then((f) => {
        stop = f;
      })
      .catch(() => undefined);
    return () => {
      window.clearInterval(id);
      stop?.();
    };
  }, [tick]);

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
  const owed = r.owed.slice(0, 2);
  const person = r.place.kind === "person";
  const call = r.place.kind === "call";
  const heading = call ? "who you're with" : person ? "what's between you" : r.visits > 1 ? "you've been here before" : "what you know";
  const subtitle = call
    ? `${r.withPeople.length ? r.withPeople.join(", ") : r.place.where} · ${r.visits} call${r.visits === 1 ? "" : "s"} here`
    : person
      ? `${r.place.where} · ${r.visits} conversation${r.visits === 1 ? "" : "s"} · last ${ago(r.lastSeen, now)}`
      : `${r.place.where} · ${r.visits} visit${r.visits === 1 ? "" : "s"} · last ${ago(r.lastSeen, now)}`;
  const quiet = !r.change?.summary && facts.length === 0 && owed.length === 0;

  return (
    <div
      className="strip"
      ref={box}
      data-kind={r.place.kind}
      onMouseEnter={() => {
        hideAt.current = 0; // reading it should not race the clock
      }}
      onMouseLeave={() => {
        hideAt.current = Date.now() + 4000;
      }}
    >
      <div className="edge" />
      <div className="sh">
        <span className="ic">{KIND_TAG[r.place.kind] ?? "APP"}</span>
        <span className="lb">{heading}</span>
        <button className="x" onClick={() => { dismissed.current.add(r.place.key); hide(); }}>esc</button>
      </div>
      <div className="body">
        <h3>{r.place.label}</h3>
        <div className="sub">{subtitle}</div>
        {owed.map((o) => (
          <div key={o.id} className={`ln owe${o.status === "overdue" ? " warn" : ""}`}>
            <span className="g">{o.direction === "you" ? "→" : "←"}</span>
            <span>
              {o.direction === "you" ? `You owe ${o.who}` : `${o.who} owes you`}: {o.text} <em>{due(o)}</em>
            </span>
          </div>
        ))}
        {r.change?.summary ? <div className="ln diff"><span className="g">Δ</span><span>{r.change.summary}</span></div> : null}
        {facts.map((f, i) => (
          <div key={i} className={`ln${f.kind === "question" ? " warn" : ""}`}>
            <span className="g">{FACT_GLYPH[f.kind]}</span>
            <span>{f.text}</span>
          </div>
        ))}
        {quiet ? (
          <div className="ln">
            <span className="g">◷</span>
            <span>{person || call ? "Nothing owed either way." : "Nothing new since your last visit."}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
