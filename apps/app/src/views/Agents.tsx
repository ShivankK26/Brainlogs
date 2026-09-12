import { useEffect, useMemo, useState } from "react";
import { DEFAULT_AGENT_PERMISSIONS, type AgentPermissions } from "@brainlog/types";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import type { AuditEntry, Status } from "../lib/types";
import { useStore } from "../state/store";
import { Header } from "../components/Header";
import { Pill, Switch } from "../components/Bits";

const KNOWN = ["claude-code", "cursor", "codex"];

function lineFor(a: AuditEntry): { cls: string; text: string } {
  const t = a.ts.slice(11, 19);
  if (a.result === "denied") return { cls: "r", text: `  ✕ ${t} ${a.scope} — denied by policy` };
  if (a.action === "write") return { cls: "m", text: `  ⋯ ${t} brainlog.remember(${a.scope.replace(/^remember /, "")}) — ${a.detail || "proposed"}` };
  return { cls: a.action === "query" ? "t" : "", text: `  ⋯ ${t} brainlog.${a.scope.split(" ")[0]}(${a.scope.slice(a.scope.indexOf(" ") + 1)}) → ${a.detail || "ok"}` };
}

export function Agents({ status }: { status: Status | null }) {
  const { version, bump, toastMsg } = useStore();
  const agents = useMemo(() => {
    const all = new Set([...KNOWN, ...(status?.agents ?? [])]);
    return [...KNOWN.filter((k) => all.has(k)), ...[...all].filter((a) => !KNOWN.includes(a)).sort()];
  }, [status]);
  const [agent, setAgent] = useState(agents[0] ?? "claude-code");
  const [replay, setReplay] = useState(0);
  useEffect(() => { if (!agents.includes(agent)) setAgent(agents[0] ?? "claude-code"); }, [agents, agent]);
  const audit = useAsync(() => api.audit(60, agent), [agent, version, replay]);
  const policy = useAsync(() => api.policy(), [version]);
  const perms: AgentPermissions = policy.data?.agentPermissions[agent] ?? DEFAULT_AGENT_PERMISSIONS;
  const lines = useMemo(() => [...(audit.data ?? [])].reverse().map(lineFor), [audit.data]);
  const last = audit.data?.[0]?.ts;
  const connected = last ? Date.now() - Date.parse(last) < 10 * 60_000 : false;
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const setPerm = async (key: keyof AgentPermissions, value: boolean) => {
    if (!policy.data) return;
    try {
      await api.setPolicy({ agentPermissions: { ...policy.data.agentPermissions, [agent]: { ...perms, [key]: value } } });
      toastMsg(`${agent}: ${key} ${value ? "allowed" : "blocked"}`);
      bump();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <>
      <Header />
      <div className="pg-wrap">
        <div className="pg">
          <h1>Agents</h1>
          <p className="sub">Coding agents connect over a local MCP socket. They read the same memory you do; writes are held as proposed until you approve them.</p>
          <div className="tabs">
            {agents.map((a) => <button key={a} className={`tb ${a === agent ? "outl" : ""}`} onClick={() => setAgent(a)}>{a}</button>)}
          </div>
          <div className="two">
            <div>
              <div className="term" id="term" key={replay}>
                {lines.length === 0 ? <div className="line t" style={{ animationDelay: "0s" }}>  no activity from {agent} yet — connect it with `brainlog mcp install {agent}`</div> : null}
                {lines.map((l, i) => <div key={i} className={`line ${l.cls}`} style={{ animationDelay: reduced ? "0s" : `${Math.min(i, 30) * 0.12}s` }}>{l.text}</div>)}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
                <button className="tb outl" id="replay" onClick={() => setReplay((r) => r + 1)}>Replay session</button>
                <Pill color={connected ? "var(--green)" : "var(--t4)"}>{agent} · {connected ? "connected" : "idle"} · local socket</Pill>
              </div>
            </div>
            <div className="panel">
              <div className="ph">Permissions<span className="m">{agent}</span></div>
              <div className="pb">
                <div className="perm"><div className="l">Read timeline<div className="d">Titles, URLs, captured text</div></div><Switch on={perms.readTimeline} label="Read timeline" onChange={(v) => setPerm("readTimeline", v)} /></div>
                <div className="perm"><div className="l">Read entity graph<div className="d">People, projects, commitments</div></div><Switch on={perms.readGraph} label="Read graph" onChange={(v) => setPerm("readGraph", v)} /></div>
                <div className="perm"><div className="l">Write notes and decisions<div className="d">Held as proposed</div></div><Switch on={perms.write} label="Allow writes" onChange={(v) => setPerm("write", v)} /></div>
                <div className="perm"><div className="l">Sensitive-tagged content<div className="d">Credentials, finance, others' private messages</div></div><Switch on={perms.readSensitive} label="Allow sensitive" onChange={(v) => setPerm("readSensitive", v)} /></div>
                <div className="perm"><div className="l">Forward context to cloud models<div className="d">{policy.data?.cloudAskEnabled ? "Enabled in Data & retention" : "Disabled by workspace policy"}</div></div><Pill color={policy.data?.cloudAskEnabled ? "var(--amber)" : "var(--red)"}>{policy.data?.cloudAskEnabled ? "Allowed" : "Blocked"}</Pill></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
