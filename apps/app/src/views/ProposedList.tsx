import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { dayLabel, timeLabel } from "../lib/format";
import { useStore } from "../state/store";

/** Proposed agent writes with approve/reject, embedded in the Agents view. */
export function ProposedList({ agent }: { agent?: string }) {
  const { version, bump, toastMsg } = useStore();
  const pending = useAsync(() => api.pending(), [version]);
  const notes = (pending.data?.notes ?? []).filter((n) => !agent || n.author === agent);
  const edges = pending.data?.edges ?? [];
  const act = async (kind: "notes" | "edges", id: string, verdict: "approve" | "reject") => {
    try {
      await (verdict === "approve" ? api.approve(kind, id) : api.reject(kind, id));
      toastMsg(verdict === "approve" ? "Approved" : "Rejected");
      bump();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : "Failed");
    }
  };
  return (
    <div className="panel" id="proposed" style={{ marginTop: 12 }}>
      <div className="ph">Proposed writes<span className="m">{notes.length + (agent ? 0 : edges.length)} to review</span></div>
      <div>
        {!pending.loading && notes.length === 0 && (agent || edges.length === 0) ? <div className="idle" style={{ padding: "16px" }}>Nothing to review{agent ? ` from ${agent}` : ""}. Writes land here as proposed until you approve them.</div> : null}
        {notes.map((n) => (
          <div key={n.id} className="note" data-note={n.id}>
            <div className="who"><span className="pill"><i style={{ background: "var(--amber)" }} />{n.author}</span>{n.kind.replace("_", " ")}{n.repo ? ` · ${n.repo}` : ""} · {dayLabel(n.createdAt)} {timeLabel(n.createdAt)}</div>
            <div className="txt">{n.text}</div>
            <div className="acts"><button className="tb primary" onClick={() => act("notes", n.id, "approve")}>Approve</button><button className="tb outl danger" onClick={() => act("notes", n.id, "reject")}>Reject</button></div>
          </div>
        ))}
        {!agent
          ? edges.map((e) => (
              <div key={e.id} className="note">
                <div className="who"><span className="pill"><i style={{ background: "var(--amber)" }} />{e.proposedBy}</span>edge · {e.kind}</div>
                <div className="txt">{e.fromEntity} {e.kind.replace("_", " ")} {e.toEntity ?? ""} · {e.evidenceEventIds.length} evidence</div>
                <div className="acts"><button className="tb primary" onClick={() => act("edges", e.id, "approve")}>Confirm</button><button className="tb outl danger" onClick={() => act("edges", e.id, "reject")}>Reject</button></div>
              </div>
            ))
          : null}
      </div>
    </div>
  );
}
