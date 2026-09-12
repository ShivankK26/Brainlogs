import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { timeLabel, dayLabel } from "../lib/format";
import { useStore } from "../state/store";

/** Pending agent writes: notes and proposed edges. User-only actions. */
export function Review() {
  const { version, bump, toastMsg, setReview } = useStore();
  const pending = useAsync(() => api.pending(), [version]);
  const act = async (kind: "notes" | "edges", id: string, verdict: "approve" | "reject") => {
    try {
      await (verdict === "approve" ? api.approve(kind, id) : api.reject(kind, id));
      toastMsg(verdict === "approve" ? "Approved" : "Rejected");
      bump();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : "Failed");
    }
  };
  const notes = pending.data?.notes ?? [];
  const edges = pending.data?.edges ?? [];
  return (
    <aside className="review" id="review">
      <div className="dhd">Proposed by agents<span className="right"><button className="tb" onClick={() => setReview(false)}>Close</button></span></div>
      {pending.error ? <div className="err">{pending.error}</div> : null}
      {!pending.loading && notes.length + edges.length === 0 ? <div className="idle">Nothing to review. Agent writes land here as proposed until you approve them.</div> : null}
      {notes.map((n) => (
        <div key={n.id} className="note" data-note={n.id}>
          <div className="who"><span className="pill"><i style={{ background: "var(--amber)" }} />{n.author}</span>{n.kind.replace("_", " ")}{n.repo ? ` · ${n.repo}` : ""} · {dayLabel(n.createdAt)} {timeLabel(n.createdAt)}</div>
          <div className="txt">{n.text}</div>
          <div className="acts"><button className="tb primary" onClick={() => act("notes", n.id, "approve")}>Approve</button><button className="tb outl danger" onClick={() => act("notes", n.id, "reject")}>Reject</button></div>
        </div>
      ))}
      {edges.map((e) => (
        <div key={e.id} className="note">
          <div className="who"><span className="pill"><i style={{ background: "var(--amber)" }} />{e.proposedBy}</span>edge · {e.kind}</div>
          <div className="txt">{e.fromEntity} {e.kind.replace("_", " ")} {e.toEntity ?? ""} · weight {e.weight.toFixed(2)} · {e.evidenceEventIds.length} evidence</div>
          <div className="acts"><button className="tb primary" onClick={() => act("edges", e.id, "approve")}>Confirm</button><button className="tb outl danger" onClick={() => act("edges", e.id, "reject")}>Reject</button></div>
        </div>
      ))}
    </aside>
  );
}
