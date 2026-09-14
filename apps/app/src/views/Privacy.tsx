import { useState } from "react";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import type { Status } from "../lib/types";
import { useStore } from "../state/store";
import { Header } from "../components/Header";
import { Pill, Switch } from "../components/Bits";

function RuleList({ label, hint, values, onChange, placeholder }: { label: string; hint: string; values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  return (
    <div className="perm" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div className="l">{label}<div className="d">{hint}</div></div>
        <span className="pill">{values.length} rule{values.length === 1 ? "" : "s"}</span>
      </div>
      <div className="rules">
        {values.map((v) => <button key={v} className="chip" onClick={() => onChange(values.filter((x) => x !== v))}>{v}<span className="x">✕</span></button>)}
        <input placeholder={placeholder} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { onChange([...new Set([...values, draft.trim()])]); setDraft(""); } }} />
      </div>
    </div>
  );
}

export function Privacy({ status }: { status: Status | null }) {
  const { version, bump, toastMsg } = useStore();
  const policy = useAsync(() => api.policy(), [version]);
  const p = policy.data;
  const save = async (patch: Parameters<typeof api.setPolicy>[0], msg: string) => {
    try {
      await api.setPolicy(patch);
      toastMsg(msg);
      bump();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : "Failed");
    }
  };
  const days = p?.retentionDays ?? status?.retentionDays ?? 30;
  return (
    <>
      <Header right={status ? <button className="tb outl" onClick={() => api.capture(status.capture.paused ? "resume" : "pause").then(() => { toastMsg(status.capture.paused ? "Capture resumed" : "Capture paused for an hour"); bump(); })}>{status.capture.paused ? "Resume capture" : "Pause capture 1 h"}</button> : null} />
      <div className="pg-wrap">
        <div className="pg">
          <h1>Data & retention</h1>
          <p className="sub">What is captured, how long it is kept, where it lives. Policy is enforced locally and cannot be overridden by agents.</p>
          <div className="two">
            <div className="panel">
              <div className="ph">Retention</div>
              <table>
                <tbody>
                  <tr><td>Raw captured text<div className="t2">Titles, URLs, on-screen text</div></td><td className="mono">{days} d</td><td><Pill color="var(--green)">Encrypted</Pill></td></tr>
                  <tr><td>Embeddings<div className="t2">int8, deduplicated</div></td><td className="mono">{days} d</td><td><Pill color="var(--green)">Encrypted</Pill></td></tr>
                  <tr><td>Entity graph<div className="t2">People, projects, commitments</div></td><td className="mono">∞</td><td><Pill color="var(--green)">Encrypted</Pill></td></tr>
                  <tr><td>Weekly summaries<div className="t2">Sources marked expired after {days} d</div></td><td className="mono">∞</td><td><Pill color="var(--green)">Encrypted</Pill></td></tr>
                  <tr><td>Retention window<div className="t2">Raw text older than this is purged nightly</div></td><td className="mono" colSpan={2}>
                    <select value={days} onChange={(e) => save({ retentionDays: Number(e.target.value) }, `Retention set to ${e.target.value} days`)} style={{ background: "var(--bg-input)", color: "var(--t1)", border: "1px solid var(--line-2)", borderRadius: 6, padding: "3px 6px" }}>
                      {[7, 14, 30, 60, 90, 180, 365].map((d) => <option key={d} value={d}>{d} days</option>)}
                    </select>
                  </td></tr>
                </tbody>
              </table>
              <div className="pb" style={{ color: "var(--t3)", fontSize: 12 }}>Data directory: <span className="mono">{status?.dataDir ?? "…"}</span></div>
            </div>
            <div className="panel">
              <div className="ph">Policy</div>
              <div className="pb">
                <div className="perm"><div className="l">Screenshots<div className="d">Text only; images never written to disk</div></div><Pill color="var(--red)">Never</Pill></div>
                <div className="perm"><div className="l">Network<div className="d">API bound to 127.0.0.1{status ? `:${status.port}` : ""}</div></div><Pill color="var(--green)">Local</Pill></div>
                <RuleList label="Blocked apps" hint="Never captured, enforced in the engine and again before disk" values={p?.blockedApps ?? []} placeholder="Add app name, Enter" onChange={(v) => save({ blockedApps: v }, "Blocked apps updated")} />
                <RuleList label="Blocked domains" hint="*.bank.com matches subdomains; bank.com matches both" values={p?.blockedDomains ?? []} placeholder="Add domain, Enter" onChange={(v) => save({ blockedDomains: v }, "Blocked domains updated")} />
                <div className="perm"><div className="l">Encryption<div className="d">AES-256-GCM, per-install key on this device</div></div><Pill color="var(--green)">On</Pill></div>
                <div className="perm"><div className="l">Cloud Ask<div className="d">Send questions and evidence to a hosted model. Off keeps everything local.</div></div><Switch on={p?.cloudAskEnabled ?? false} label="Cloud Ask" onChange={(v) => save({ cloudAskEnabled: v }, v ? "Cloud Ask enabled" : "Cloud Ask disabled")} /></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
