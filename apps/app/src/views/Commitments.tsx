import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import type { Commitment } from "../lib/types";
import { dateLabel, initialsOf } from "../lib/format";
import { useStore } from "../state/store";
import { Header } from "../components/Header";
import { Review } from "./Review";

type Bucket = { key: string; label: string; hint: string; rows: Commitment[] };

const DAY = 86_400_000;

function isYou(p: string): boolean {
  return /^(you|me|yourself|myself)$/i.test(p);
}
/** The other party on a commitment, as the row should name them. */
function counterpart(c: Commitment): string {
  const other = isYou(c.fromParty) ? c.toParty : c.fromParty;
  return isYou(other) ? "yourself" : other;
}
/** Strip quote marks and preview wrappers from extracted text so the row reads like a task. */
function cleanText(t: string): string {
  return t.replace(/^[\s"'“”]+|[\s"'“”]+$/g, "").replace(/^(?:your\s+)?message,\s*/i, "").replace(/\s+/g, " ").trim();
}
function dueLabel(c: Commitment, now: number): { text: string; tone: "late" | "soon" | "" } {
  if (!c.dueAt) return { text: "", tone: "" };
  const d = Date.parse(c.dueAt) - now;
  if (d < 0) return { text: `${Math.max(1, Math.round(-d / DAY))}d overdue`, tone: "late" };
  if (d < DAY) return { text: "due today", tone: "soon" };
  if (d < 2 * DAY) return { text: "due tomorrow", tone: "soon" };
  return { text: `due ${dateLabel(c.dueAt)}`, tone: "" };
}
function age(ts: string, now: number): string {
  const d = Math.round((now - Date.parse(ts)) / DAY);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : d < 7 ? `${d} days ago` : dateLabel(ts);
}

function bucketize(all: Commitment[], now: number): Bucket[] {
  const live = all.filter((c) => c.status !== "dismissed");
  const overdue = live.filter((c) => c.status === "overdue" || (c.dueAt && c.status !== "done" && Date.parse(c.dueAt) < now));
  const rest = live.filter((c) => !overdue.includes(c) && c.status !== "done");
  const youOwe = rest.filter((c) => isYou(c.fromParty));
  const owedToYou = rest.filter((c) => !isYou(c.fromParty));
  const done = live.filter((c) => c.status === "done" && now - Date.parse(c.updatedAt) < 14 * DAY);
  return [
    { key: "overdue", label: "Overdue", hint: "Past their date. Deal with these first.", rows: overdue },
    { key: "you", label: "You owe", hint: "Things you said you would do.", rows: youOwe },
    { key: "them", label: "Owed to you", hint: "Things you asked others for, or they promised.", rows: owedToYou },
    { key: "done", label: "Done recently", hint: "Closed in the last two weeks.", rows: done },
  ].filter((b) => b.rows.length > 0);
}

export function Commitments() {
  const { version, reviewOpen, setReview, toastMsg, select, go, setFilter, bump } = useStore();
  const cm = useAsync(() => api.commitments(), [version]);
  const pending = useAsync(() => api.pending(), [version]);
  const n = (pending.data?.notes.length ?? 0) + (pending.data?.edges.length ?? 0);
  const now = Date.now();
  const buckets = useMemo(() => bucketize(cm.data ?? [], now), [cm.data, now]);
  const [busy, setBusy] = useState<string | null>(null);
  const live = (cm.data ?? []).filter((c) => c.status !== "dismissed" && c.status !== "done");
  const overdueN = buckets.find((b) => b.key === "overdue")?.rows.length ?? 0;
  const youN = buckets.find((b) => b.key === "you")?.rows.length ?? 0;
  const themN = buckets.find((b) => b.key === "them")?.rows.length ?? 0;
  const doneN = buckets.find((b) => b.key === "done")?.rows.length ?? 0;

  const openEvidence = (c: Commitment) => {
    const ids = c.evidenceEventIds.map((r) => (typeof r === "string" ? r : r.eventId));
    if (c.closedByEventId) ids.push(c.closedByEventId);
    if (ids.length === 0) return toastMsg("No source messages linked");
    setFilter({ kind: "ids", ids, label: `Source of “${cleanText(c.text).slice(0, 40)}${c.text.length > 40 ? "…" : ""}”` });
    go("memory");
    select(ids[0]!);
  };
  const act = async (c: Commitment, status: "done" | "dismissed" | "open", msg: string) => {
    setBusy(c.id);
    try {
      await api.setCommitment(c.id, status);
      toastMsg(msg);
      bump();
    } catch (e) {
      toastMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Header right={<button className="tb primary" id="reviewBtn" onClick={() => setReview(!reviewOpen)}>Review proposed ({n})</button>} />
      <div className={`body ${reviewOpen ? "" : "wide"}`}>
        <div className="list cmts">
          <div className="cstrip">
            <div className={`cs${overdueN ? " late" : ""}`}><b>{overdueN}</b><span>overdue</span></div>
            <div className="cs"><b>{youN}</b><span>you owe</span></div>
            <div className="cs"><b>{themN}</b><span>owed to you</span></div>
            <div className="cs"><b>{doneN}</b><span>done, 14 days</span></div>
            <span className="sp" />
            <span className="pill">{cm.loading ? "Loading…" : `${live.length} open`}</span>
          </div>
          {cm.error ? <div className="err">{cm.error}</div> : null}
          {!cm.loading && buckets.length === 0 ? (
            <div className="empty cempty">
              <div className="t">Nothing to follow up on.</div>
              <div className="d">Brainlogs turns promises and requests in your chats and mail into commitments: “I'll send the spec by Friday”, “can you review the pricing table?”. They appear here with the messages they came from and close themselves when a follow-up shows up.</div>
            </div>
          ) : null}
          <div id="crows">
            {buckets.map((b) => (
              <section key={b.key} className="cbucket">
                <div className="grp">{b.label}<span className="cnt">{b.rows.length}</span><span className="hint">{b.hint}</span></div>
                {b.rows.map((c) => {
                  const who = counterpart(c);
                  const due = dueLabel(c, now);
                  const youOwe = isYou(c.fromParty);
                  const isDone = c.status === "done";
                  return (
                    <div key={c.id} className={`crow${isDone ? " done" : ""}`} data-c={c.id}>
                      <span className="av" title={who}>{initialsOf(who)}</span>
                      <div className="cbody">
                        <div className="ctext">{cleanText(c.text)}</div>
                        <div className="cmeta">
                          <span>{youOwe ? `you → ${who}` : `${who} → you`}</span>
                          <span>· {age(c.createdAt, now)}</span>
                          {due.text ? <span className={`due ${due.tone}`}>· {due.text}</span> : null}
                          {c.status === "stalled" ? <span className="due soon">· no reply for 3 days</span> : null}
                          {c.status === "waiting" ? <span>· waiting on {who}</span> : null}
                          {isDone && c.closedByEventId ? <span>· closed by a follow-up</span> : null}
                          <button className="lnk" onClick={() => openEvidence(c)}>· {c.evidenceEventIds.length} source{c.evidenceEventIds.length === 1 ? "" : "s"}</button>
                        </div>
                      </div>
                      <div className="cacts">
                        {isDone ? (
                          <button className="tb outl" disabled={busy === c.id} onClick={() => act(c, "open", "Reopened")}>Reopen</button>
                        ) : (
                          <>
                            <button className="tb outl" disabled={busy === c.id} onClick={() => act(c, "done", "Marked done")}>Done</button>
                            <button className="tb" disabled={busy === c.id} title="Not a real commitment, or no longer relevant" onClick={() => act(c, "dismissed", "Dismissed")}>Dismiss</button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        </div>
        {reviewOpen ? <Review /> : null}
      </div>
    </>
  );
}
