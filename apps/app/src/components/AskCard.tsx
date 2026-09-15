import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { AskMoment, AskResult, ModelStatus } from "../lib/types";
import { useStore } from "../state/store";

const VIA_LABEL: Record<AskResult["via"], string> = { cloud: "Written by Claude", local: "Written by the local model", none: "Answered from your timeline" };
const KIND_ICON: Record<AskMoment["kind"], string> = { message: "💬", mail: "✉️", meeting: "📞", doc: "📄", code: "⌥", page: "◎", app: "▣" };

function fmtTime(ts: string): string {
  return new Date(ts).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function fmtClock(ts: string): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
function span(m: AskMoment): string {
  if (m.start === m.end) return fmtTime(m.start);
  const same = new Date(m.start).toDateString() === new Date(m.end).toDateString();
  return same ? `${fmtTime(m.start)} – ${fmtClock(m.end)}` : `${fmtTime(m.start)} → ${fmtTime(m.end)}`;
}

/** Prose from a model, with `[n]` markers wired to the nth cited moment. */
function Prose({ text, citations, onCite }: { text: string; citations: string[]; onCite: (id: string) => void }) {
  return (
    <div className="prose">
      {text.split("\n").filter((l) => l.trim()).map((line, i) => (
        <p key={i}>
          {line.split(/(\[\d+\])/).map((part, j) => {
            const m = /^\[(\d+)\]$/.exec(part);
            const id = m ? citations[Number(m[1]) - 1] : undefined;
            return id ? <button key={j} className="cite" onClick={() => onCite(id)}>{part}</button> : <span key={j}>{part}</span>;
          })}
        </p>
      ))}
    </div>
  );
}

/**
 * Free written answers: Ollama runs on this machine. Walks the user from "not installed" to
 * "model ready" with one button per step; progress is polled while a download runs.
 */
export function ModelSetup({ compact }: { compact?: boolean }) {
  const { bump, toastMsg } = useStore();
  const [st, setSt] = useState<ModelStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => api.models().then(setSt, () => setSt(null));
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (!st?.pull || st.pull.done) return;
    const t = window.setInterval(refresh, 1500);
    return () => window.clearInterval(t);
  }, [st?.pull?.done, st?.pull?.model]);
  useEffect(() => {
    if (st?.pull?.done && !st.pull.error) bump();
  }, [st?.pull?.done, st?.pull?.error, bump]);
  if (!st) return null;
  if (st.askModel && !st.pull) return null;
  const act = async (fn: () => Promise<ModelStatus>) => {
    setBusy(true);
    try {
      setSt(await fn());
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };
  const pull = st.pull;
  const pct = pull && pull.total > 0 ? Math.round((pull.completed / pull.total) * 100) : null;
  return (
    <div className={`msetup${compact ? " compact" : ""}`} id="modelSetup">
      <div className="mh">Get written answers, free</div>
      {!st.installed && !st.running ? (
        <>
          <p>Brainlogs can use <b>Ollama</b>, a free model runner that stays on this Mac. Install it, then come back here.</p>
          <div className="macts"><a className="tb primary" href={st.downloadUrl} target="_blank" rel="noreferrer">Download Ollama</a><button className="tb outl" onClick={refresh}>I've installed it</button></div>
        </>
      ) : !st.running ? (
        <>
          <p>Ollama is installed but not running.</p>
          <div className="macts"><button className="tb primary" disabled={busy} onClick={() => act(api.startModel)}>{busy ? "Starting…" : "Start Ollama"}</button></div>
        </>
      ) : pull && !pull.done ? (
        <>
          <p>Downloading <b>{pull.model}</b>… {pct !== null ? `${pct}%` : pull.status}</p>
          <div className="bar"><i style={{ width: `${pct ?? 5}%` }} /></div>
        </>
      ) : pull?.error ? (
        <>
          <p>Download failed: {pull.error}</p>
          <div className="macts"><button className="tb primary" disabled={busy} onClick={() => act(() => api.pullModel(st.recommended))}>Retry</button></div>
        </>
      ) : !st.askModel ? (
        <>
          <p>Ollama is running. Download <b>{st.recommended}</b> ({st.recommendedSize}) once and every question gets a written answer, offline.</p>
          <div className="macts"><button className="tb primary" id="pullModel" disabled={busy} onClick={() => act(() => api.pullModel(st.recommended))}>Download {st.recommended}</button></div>
        </>
      ) : (
        <p>Model <b>{st.askModel}</b> is ready. Ask again to get a written answer.</p>
      )}
    </div>
  );
}

export function AskCard({ question, result, loading, onCite }: { question: string; result: AskResult | null; loading: boolean; onCite: (id: string) => void }) {
  const s = result?.structured;
  return (
    <div className="askcard" id="askCard">
      <div className="q">{question}</div>
      {loading ? <div className="a thinking">Looking through your timeline…</div> : null}
      {result && s ? (
        <>
          {result.via !== "none" ? (
            <Prose text={result.answer} citations={result.citations} onCite={onCite} />
          ) : (
            <>
              <div className="verdict">{s.verdict}</div>
              {s.detail ? <div className="detail">{s.detail}</div> : null}
            </>
          )}
          {s.facts.length ? (
            <dl className="facts">
              {s.facts.map((f, i) => (
                <div key={i} className="fact">
                  <dt>{f.label}</dt>
                  <dd>{f.eventId ? <button className="lnk" onClick={() => onCite(f.eventId!)}>{f.value}</button> : f.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {s.moments.length ? (
            <ul className="moments">
              {s.moments.map((m, i) => (
                <li key={m.eventId}>
                  <button className="mom" onClick={() => onCite(m.eventId)}>
                    <span className="n">{i + 1}</span>
                    <span className="k" aria-hidden>{KIND_ICON[m.kind]}</span>
                    <span className="t">{m.title}</span>
                    <span className="meta">{m.app}{m.count > 1 ? ` · ${m.count} captures` : ""}</span>
                    <span className="when">{span(m)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="m">
            {VIA_LABEL[result.via]}{result.via !== "none" ? ` (${result.model})` : ""}
            {s.scope.label ? ` · ${s.scope.label}` : ""}
            {result.withheld ? ` · ${result.withheld} sensitive moment${result.withheld === 1 ? "" : "s"} kept off the cloud` : ""}
          </div>
          {result.via === "none" ? <ModelSetup compact /> : null}
        </>
      ) : null}
    </div>
  );
}
