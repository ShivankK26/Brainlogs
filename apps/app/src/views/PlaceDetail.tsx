import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import type { PlaceFact } from "../lib/types";
import { hours } from "../lib/format";
import { useStore } from "../state/store";
import { Header } from "../components/Header";

function when(ts: string): string {
  return new Date(ts).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
const FACT_LABEL: Record<PlaceFact["kind"], string> = { decision: "decided", question: "open", promise: "promised" };

/** One place: every visit, and what was different each time you came back. */
export function PlaceDetail({ placeKey, onBack }: { placeKey: string; onBack: () => void }) {
  const { version, setFilter, go, select } = useStore();
  const h = useAsync(() => api.place(placeKey), [placeKey, version]);
  const d = h.data;
  const openVisit = (eventIds: string[]) => {
    if (eventIds.length === 0) return;
    setFilter({ kind: "ids", ids: eventIds.slice(0, 12), label: `Visit to ${d?.place.label ?? "this place"}` });
    go("memory");
    select(eventIds[0]!);
  };

  return (
    <>
      <Header right={<button className="tb outl" onClick={onBack}>← All places</button>} />
      <div className="pg-wrap">
        <div className="pg wide">
          {h.error ? <div className="err">{h.error}</div> : null}
          {!d ? <div className="empty">{h.loading ? "Loading…" : "That place is no longer in memory."}</div> : (
            <>
              <h1>{d.place.label}</h1>
              <p className="sub">{d.place.where} · {d.visits.length} visit{d.visits.length === 1 ? "" : "s"} · {hours(d.visits.reduce((n, v) => n + v.ms, 0))} in total</p>
              <div className="two" style={{ gridTemplateColumns: "minmax(0,1fr) 300px" }}>
                <div className="visits">
                  {d.visits.map((v) => (
                    <div key={v.start} className="visit">
                      <div className="when">{when(v.start)}</div>
                      <div className="rail"><i className={v.change ? "ch" : ""} /></div>
                      <div className="what">
                        <div className="t">{v.app} · {Math.max(1, Math.round(v.ms / 60_000))} min</div>
                        {v.change?.summary ? (
                          <div className="chg"><b>changed since the visit before</b>{v.change.summary}</div>
                        ) : null}
                        <button className="lnk" onClick={() => openVisit(v.eventIds)}>Open this visit</button>
                      </div>
                    </div>
                  ))}
                </div>
                <aside>
                  <div className="panel"><div className="ph">What's on the record</div><div className="pb">
                    {d.facts.length === 0 ? <div className="muted">No decisions or open questions found in the captured text yet.</div> : null}
                    {d.facts.map((f, i) => (
                      <div key={i} className="fact"><span className={`fk ${f.kind}`}>{FACT_LABEL[f.kind]}</span><span className="ft">{f.text}</span></div>
                    ))}
                  </div></div>
                </aside>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
