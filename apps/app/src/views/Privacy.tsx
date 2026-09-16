import { useState, type ReactNode } from "react";
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
      {label ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="l">{label}<div className="d">{hint}</div></div>
          <span className="pill">{values.length} rule{values.length === 1 ? "" : "s"}</span>
        </div>
      ) : null}
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

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="settings">
      <div className="sh"><h2>{title}</h2>{hint ? <p>{hint}</p> : null}</div>
      <div className="sbody">{children}</div>
    </section>
  );
}

function Row({ label, hint, children, stack }: { label: string; hint?: string; children?: ReactNode; stack?: boolean }) {
  return (
    <div className={`srow${stack ? " stack" : ""}`}>
      <div className="l">{label}{hint ? <div className="d">{hint}</div> : null}</div>
      <div className="c">{children}</div>
    </div>
  );
}

export function Privacy({ status }: { status: Status | null }) {
  const { version, bump, toastMsg, go } = useStore();
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
        <div className="pg settings-pg">
          <h1>Data &amp; retention</h1>
          <p className="sub">Everything Brainlogs stores lives on this device, encrypted. These rules are enforced locally and agents cannot change them.</p>

          <Section title="Retention" hint="How long each kind of data is kept.">
            <Row label="Raw captured text" hint="Window titles, URLs, on-screen text"><span className="val">{days} days</span><Pill color="var(--green)">Encrypted</Pill></Row>
            <Row label="Embeddings" hint="Search index, deduplicated"><span className="val">{days} days</span><Pill color="var(--green)">Encrypted</Pill></Row>
            <Row label="People, projects, commitments" hint="Kept; sources expire with the raw text"><span className="val">Kept</span><Pill color="var(--green)">Encrypted</Pill></Row>
            <Row label="Retention window" hint="Raw text older than this is purged nightly">
              <select className="sel" value={days} onChange={(e) => save({ retentionDays: Number(e.target.value) }, `Retention set to ${e.target.value} days`)}>
                {[7, 14, 30, 60, 90, 180, 365].map((d) => <option key={d} value={d}>{d} days</option>)}
              </select>
            </Row>
            <Row label="Data directory"><span className="val mono">{status?.dataDir ?? "…"}</span></Row>
          </Section>

          <Section title="Capture rules" hint="What is never recorded, enforced in the engine and again before anything is written.">
            <Row label="Screenshots" hint="Text only; images are never written to disk"><Pill color="var(--red)">Never</Pill></Row>
            <Row label="Network" hint={`API bound to 127.0.0.1${status ? `:${status.port}` : ""}; nothing leaves the device unless you turn on Cloud Ask`}><Pill color="var(--green)">Local only</Pill></Row>
            <Row label="Blocked apps" hint="Never captured" stack>
              <RuleList label="" hint="" values={p?.blockedApps ?? []} placeholder="Add app name, Enter" onChange={(v) => save({ blockedApps: v }, "Blocked apps updated")} />
            </Row>
            <Row label="Blocked domains" hint="*.bank.com matches subdomains; bank.com matches both" stack>
              <RuleList label="" hint="" values={p?.blockedDomains ?? []} placeholder="Add domain, Enter" onChange={(v) => save({ blockedDomains: v }, "Blocked domains updated")} />
            </Row>
          </Section>

          <Section title="Security" hint="Keys and encryption.">
            <Row label="Encryption at rest" hint="AES-256-GCM with a per-install key kept on this device"><Pill color="var(--green)">On</Pill></Row>
            <Row label="Agent access" hint="Coding agents connect over a local socket; their writes are held for your review and every read is audited"><button className="tb outl" onClick={() => go("audit")}>See audit log</button></Row>
          </Section>

          <Section title="Models" hint="Ask works from your timeline alone. A model adds written answers.">
            <Row label="Local model" hint="Free, runs on this device with Ollama. Used automatically once installed." stack><ModelSetup /></Row>
            <Row label="Cloud Ask" hint="" stack>
              <CloudAsk status={status} enabled={p?.cloudAskEnabled ?? false} onToggle={(v) => save({ cloudAskEnabled: v }, v ? "Cloud Ask enabled" : "Cloud Ask disabled")} />
            </Row>
          </Section>
        </div>
      </div>
    </>
  );
}
