import type { Actor, Commitment, Event, Note, Summary } from "@brainlog/types";
import { getPolicy, listAudit, writeAudit } from "@brainlog/core";
import { PolicyDeniedError, finishAudit, gate, type GateRequest } from "@brainlog/policy";
import { search, type SearchDeps } from "./search.js";
import { moment } from "./moment.js";
import { commitments, entity, setCommitmentStatus, summary, timeline } from "./graph-reads.js";
import { ask, type AskDeps } from "./ask.js";
import { listNotes, listProposedEdges, propose, review } from "./notes.js";
import { entitiesForEvents, stats, topEntities } from "./store.js";
import { pulse, type PulseResult } from "./pulse.js";
import { IsoDate, type Entity } from "@brainlog/types";
import {
  AskRequest,
  CommitmentsRequest,
  EntityRequest,
  MomentRequest,
  ProposeRequest,
  ReviewRequest,
  SearchRequest,
  SummaryRequest,
  TimelineRequest,
  type AskResult,
  type EntityResult,
  type MomentResult,
  type ReviewResult,
  type SearchResult,
} from "./types.js";

export type QueryApiOptions = { actor: Actor; deps?: AskDeps };

function short(s: string, n = 80): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/**
 * The query API (§9). One instance per actor. Every method:
 * 1. validates input with zod, 2. runs policy.gate (writes an audit row, throws on denial),
 * 3. executes, 4. records the outcome. Denied calls never return partial data.
 */
export function createQueryApi(opts: QueryApiOptions) {
  const actor = opts.actor;
  const deps: SearchDeps & AskDeps = opts.deps ?? {};

  async function run<T>(req: GateRequest, fn: (perms: { readSensitive: boolean }) => Promise<T> | T, describe: (r: T) => string): Promise<T> {
    const { permissions, auditId } = gate(getPolicy(), actor, req);
    try {
      const r = await fn(permissions);
      finishAudit(auditId, { result: "ok", detail: describe(r) });
      return r;
    } catch (e) {
      finishAudit(auditId, { result: "error", detail: e instanceof Error ? e.name : "error" });
      throw e;
    }
  }

  const requireUser = (req: GateRequest) => {
    if (actor !== "user") {
      writeAudit({ actor, action: req.action, scope: req.scope, result: "denied", detail: "user only" });
      throw new PolicyDeniedError(actor, [], req.scope);
    }
  };

  return {
    actor,
    search(input: SearchRequest): Promise<SearchResult> {
      const p = SearchRequest.parse(input);
      return run({ action: "query", scope: `search q="${short(p.q)}"`, needs: ["readTimeline"] }, (perms) => search(p, perms, deps), (r) => `${r.hits.length} events`);
    },
    moment(input: MomentRequest): Promise<MomentResult | null> {
      const p = MomentRequest.parse(input);
      return run({ action: "query", scope: `moment ${p.eventId}`, needs: ["readTimeline"] }, (perms) => moment(p, perms), (r) => (r ? `${1 + r.alsoOnScreen.length + r.before.length + r.after.length} events` : "not found"));
    },
    timeline(input: TimelineRequest): Promise<Event[]> {
      const p = TimelineRequest.parse(input);
      return run({ action: "query", scope: `timeline ${p.from.slice(0, 10)}..${p.to.slice(0, 10)}`, needs: ["readTimeline"] }, (perms) => timeline(p, perms), (r) => `${r.length} events`);
    },
    /** Timeline plus the entities linked to each event, for list rows that show labels. */
    timelineDetailed(input: TimelineRequest): Promise<{ events: Event[]; entities: Record<string, Entity[]> }> {
      const p = TimelineRequest.parse(input);
      return run(
        { action: "query", scope: `timeline ${p.from.slice(0, 10)}..${p.to.slice(0, 10)}`, needs: ["readTimeline", "readGraph"] },
        (perms) => {
          const events = timeline(p, perms);
          const map = entitiesForEvents(events.map((e) => e.id));
          const entities: Record<string, Entity[]> = {};
          for (const [k, v] of map) entities[k] = v;
          return { events, entities };
        },
        (r) => `${r.events.length} events`,
      );
    },
    pulse(input: { date?: string } = {}): Promise<PulseResult> {
      const date = IsoDate.parse(input.date ?? new Date().toISOString().slice(0, 10));
      return run({ action: "query", scope: `pulse week of ${date}`, needs: ["readTimeline", "readGraph"] }, (perms) => pulse({ date }, perms), (r) => `${r.eventCount} events`);
    },
    entity(input: EntityRequest): Promise<EntityResult> {
      const p = EntityRequest.parse(input);
      const key = "id" in p ? p.id : p.name;
      return run({ action: "query", scope: `entity ${short(key, 60)}`, needs: ["readGraph"] }, (perms) => entity(p, perms), (r) => (r ? `${r.recentEvents.length} events, ${r.edges.length} edges` : "not found"));
    },
    /** User-only: mark a commitment done, dismiss it, or reopen it. Audited as a write. */
    setCommitment(input: { id: string; status: "done" | "dismissed" | "open" }): Promise<Commitment | null> {
      if (opts.actor !== "user") return Promise.reject(new PolicyDeniedError(opts.actor, [], "commitment status"));
      return run({ action: "write", scope: `commitment ${input.id} → ${input.status}`, needs: ["write"] }, () => setCommitmentStatus(input.id, input.status), (r) => (r ? r.status : "not found"));
    },
    commitments(input: CommitmentsRequest = {}): Promise<Commitment[]> {
      const p = CommitmentsRequest.parse(input);
      return run({ action: "query", scope: `commitments${p.status ? ` status=${p.status}` : ""}${p.party ? ` party=${short(p.party, 40)}` : ""}`, needs: ["readGraph"] }, (perms) => commitments(p, perms), (r) => `${r.length} rows`);
    },
    summary(input: SummaryRequest): Promise<Summary | null> {
      const p = SummaryRequest.parse(input);
      return run({ action: "query", scope: `summary ${p.period} ${p.date}`, needs: ["readGraph"] }, (perms) => summary(p, perms), (r) => (r ? "1 summary" : "none"));
    },
    ask(input: AskRequest): Promise<AskResult> {
      const p = AskRequest.parse(input);
      return run({ action: "query", scope: `ask "${short(p.question)}"`, needs: ["readTimeline", "readGraph"] }, (perms) => ask(p, perms, deps), (r) => `${r.citations.length} citations via ${r.model}`);
    },
    propose(input: ProposeRequest): Promise<Note> {
      const p = ProposeRequest.parse(input);
      return run({ action: "write", scope: `remember ${p.note.kind}${p.note.repo ? ` repo=${short(p.note.repo, 40)}` : ""}`, needs: ["write"] }, () => propose(actor, p.note), (r) => `${r.status} ${r.id}`);
    },
    async approve(input: ReviewRequest): Promise<ReviewResult> {
      const p = ReviewRequest.parse(input);
      const req: GateRequest = { action: "write", scope: `approve ${"noteId" in p ? p.noteId : p.edgeId}`, needs: [] };
      requireUser(req);
      return run(req, () => review(p, "approve"), (r) => (r ? r.kind : "not found"));
    },
    async reject(input: ReviewRequest): Promise<ReviewResult> {
      const p = ReviewRequest.parse(input);
      const req: GateRequest = { action: "write", scope: `reject ${"noteId" in p ? p.noteId : p.edgeId}`, needs: [] };
      requireUser(req);
      return run(req, () => review(p, "reject"), (r) => (r ? r.kind : "not found"));
    },
    /** Pending agent writes for the review queue. User only. */
    async pending(): Promise<{ notes: Note[]; edges: ReturnType<typeof listProposedEdges> }> {
      const req: GateRequest = { action: "query", scope: "pending", needs: [] };
      requireUser(req);
      return run(req, () => ({ notes: listNotes({ status: "proposed" }), edges: listProposedEdges() }), (r) => `${r.notes.length} notes, ${r.edges.length} edges`);
    },
    entities(input: { limit?: number } = {}): Promise<Entity[]> {
      const limit = input.limit === undefined ? 20 : input.limit;
      return run({ action: "query", scope: `entities top=${limit}`, needs: ["readGraph"] }, () => topEntities(limit), (r) => `${r.length} entities`);
    },
    /** Counts for status displays. Not audited: it reveals no content. */
    async stats() {
      return stats();
    },
    notes(input: { status?: Note["status"]; limit?: number } = {}): Promise<Note[]> {
      return run({ action: "query", scope: `notes${input.status ? ` status=${input.status}` : ""}`, needs: ["readGraph"] }, () => listNotes(input), (r) => `${r.length} notes`);
    },
    async audit(input: { limit?: number; actor?: string } = {}) {
      const req: GateRequest = { action: "query", scope: "audit", needs: [] };
      requireUser(req);
      return listAudit(input);
    },
  };
}

export type QueryApi = ReturnType<typeof createQueryApi>;
