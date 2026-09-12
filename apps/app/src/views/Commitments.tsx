import { useMemo } from "react";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import type { Commitment } from "../lib/types";
import { cmtId, dateLabel } from "../lib/format";
import { useStore } from "../state/store";
import { Header } from "../components/Header";
import { Pri, St } from "../components/Bits";
import { Review } from "./Review";

const GROUPS: Array<{ key: Commitment["status"][]; label: string }> = [
  { key: ["overdue"], label: "Overdue" },
  { key: ["open", "stalled"], label: "Open" },
  { key: ["waiting"], label: "Waiting" },
  { key: ["done"], label: "Done" },
  { key: ["dismissed"], label: "Dismissed" },
];
const ST: Record<Commitment["status"], "open" | "prog" | "done" | "block" | "wait" | "dismissed"> = { overdue: "block", open: "open", stalled: "prog", waiting: "wait", done: "done", dismissed: "dismissed" };
const PRI: Record<Commitment["status"], "low" | "med" | "high" | "urgent"> = { overdue: "urgent", stalled: "high", open: "med", waiting: "low", done: "low", dismissed: "low" };

export function Commitments() {
  const { version, reviewOpen, setReview, toastMsg, select, go, setFilter } = useStore();
  const cm = useAsync(() => api.commitments(), [version]);
  const pending = useAsync(() => api.pending(), [version]);
  const n = (pending.data?.notes.length ?? 0) + (pending.data?.edges.length ?? 0);
  const groups = useMemo(() => GROUPS.map((g) => ({ ...g, rows: (cm.data ?? []).filter((c) => g.key.includes(c.status)) })).filter((g) => g.rows.length > 0), [cm.data]);

  const openEvidence = (c: Commitment) => {
    const ids = c.evidenceEventIds.map((r) => (typeof r === "string" ? r : r.eventId));
    if (c.closedByEventId) ids.push(c.closedByEventId);
    setFilter({ kind: "ids", ids, label: `Evidence for ${cmtId(c.id)}` });
    go("memory");
    if (ids[0]) select(ids[0]);
  };

  return (
    <>
      <Header right={<button className="tb primary" id="reviewBtn" onClick={() => setReview(!reviewOpen)}>Review proposed ({n})</button>} />
      <div className={`body ${reviewOpen ? "" : "wide"}`}>
        <div className="list">
          <div className="fbar"><span className="pill">{cm.loading ? "Loading…" : `${cm.data?.length ?? 0} commitments`}</span><span className="sp" /></div>
          {cm.error ? <div className="err">{cm.error}</div> : null}
          {!cm.loading && (cm.data?.length ?? 0) === 0 ? <div className="empty">No commitments yet. They are extracted from your messages by the graph job.</div> : null}
          <div id="crows">
            {groups.map((g) => (
              <div key={g.label}>
                <div className="grp">{g.label}<span className="cnt">{g.rows.length}</span></div>
                {g.rows.map((c) => (
                  <button key={c.id} className="row" data-c={c.id} onClick={() => (c.evidenceEventIds.length ? openEvidence(c) : toastMsg("No evidence linked yet"))}>
                    <St s={ST[c.status]} />
                    <span className="id">{cmtId(c.id)}</span>
                    <span className="ttl">{c.text}<span className="sub"> — {c.evidenceEventIds.length} evidence{c.closedByEventId ? " · closed automatically" : ""}</span></span>
                    <span className="meta"><Pri p={PRI[c.status]} /><span>{c.fromParty} → {c.toParty}</span><span>{c.dueAt ? dateLabel(c.dueAt) : "—"}</span></span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
        {reviewOpen ? <Review /> : null}
      </div>
    </>
  );
}
