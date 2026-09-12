import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { useStore } from "../state/store";
import { Header } from "../components/Header";
import { Pill } from "../components/Bits";

const COLOR = { ok: "var(--green)", denied: "var(--red)", error: "var(--amber)" } as const;

export function Audit() {
  const { version } = useStore();
  const audit = useAsync(() => api.audit(300), [version]);
  return (
    <>
      <Header right={<a className="tb outl" href="/api/v1/audit.csv" download>Export CSV</a>} />
      <div className="pg-wrap">
        <div className="pg wide">
          <h1>Audit log</h1>
          <p className="sub">Every read and write against memory, by you or by an agent.</p>
          {audit.error ? <div className="err">{audit.error}</div> : null}
          <div className="panel">
            <table id="atab">
              <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Scope</th><th>Result</th></tr></thead>
              <tbody>
                {(audit.data ?? []).map((a) => (
                  <tr key={a.id}>
                    <td className="mono">{a.ts.slice(0, 10)} {a.ts.slice(11, 19)}</td>
                    <td>{a.actor === "user" ? "you" : a.actor}</td>
                    <td>{a.action}</td>
                    <td className="mono">{a.scope}</td>
                    <td><Pill color={COLOR[a.result]}>{a.result === "denied" ? "Denied by policy" : a.detail || a.result}</Pill></td>
                  </tr>
                ))}
                {!audit.loading && (audit.data?.length ?? 0) === 0 ? <tr><td colSpan={5} className="empty">No audit entries yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
