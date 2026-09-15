import { useState } from "react";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import type { Status } from "../lib/types";
import { useStore } from "../state/store";
import { Header } from "../components/Header";
import { Pill, Switch } from "../components/Bits";
import { ModelSetup } from "../components/AskCard";

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

function CloudAsk({ status, enabled, onToggle }: { status: Status | null; enabled: boolean; onToggle: (v: boolean) => void }) {
  const { bump, toastMsg } = useStore();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const cloud = status?.cloudAsk;
  const saveKey = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await api.setCloudKey(draft.trim());
      setDraft("");
      toastMsg("Claude API key saved on this device");
      bump();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : "Could not save the key");
    } finally {
      setBusy(false);
    }
  };
  const removeKey = async () => {
    try {
      await api.deleteCloudKey();
      toastMsg("Claude API key removed");
      bump();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : "Could not remove the key");
    }
  };
  return (
    <div className="perm" style={{ flexDirection: "column", alignItems: "stretch" }} id="cloudAsk">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div className="l">Cloud Ask<div className="d">Answer questions with Claude ({cloud?.model ?? "claude-opus-5"}) using your own API key. Only the question and moments with no sensitivity tag are sent; credentials, finance, health and other people's messages stay on this device. Off keeps everything local.</div></div>
        <Switch on={enabled} label="Cloud Ask" onChange={onToggle} />
      </div>
      <div className="rules" style={{ alignItems: "center" }}>
        {cloud?.hasKey ? (
          <>
            <span className="chip mono">{cloud.keyHint}{cloud.keySource === "env" ? " · from ANTHROPIC_API_KEY" : ""}</span>
            {cloud.keySource === "file" ? <button className="tb outl" id="cloudKeyRemove" onClick={removeKey}>Remove key</button> : null}
          </>
        ) : (
          <>
            <input id="cloudKey" type="password" placeholder="sk-ant-… (stored as a 0600 file in the data directory)" value={draft} autoComplete="off" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void saveKey(); }} style={{ flex: 1 }} />
            <button className="tb primary" id="cloudKeySave" disabled={busy || !draft.trim()} onClick={saveKey}>Save key</button>
          </>
        )}
        {enabled && !cloud?.hasKey ? <span className="pill" style={{ color: "var(--amber)" }}>Enabled, but no key yet: answers stay local</span> : null}
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
                <div className="perm" style={{ flexDirection: "column", alignItems: "stretch" }}>
                  <div className="l">Local model<div className="d">Free written answers with Ollama on this device. Ask uses it automatically once a model is installed.</div></div>
                  <ModelSetup />
                </div>
                <CloudAsk status={status} enabled={p?.cloudAskEnabled ?? false} onToggle={(v) => save({ cloudAskEnabled: v }, v ? "Cloud Ask enabled" : "Cloud Ask disabled")} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
