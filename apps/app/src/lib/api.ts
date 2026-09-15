import type { AskResult, AuditEntry, Commitment, Entity, Event, Facets, ModelStatus, MomentResult, Note, Pending, Policy, Pulse, QueryFilters, SearchResult, Status, TimelineDetailed } from "./types";

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/v1${path}`, { credentials: "same-origin", ...init, headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) } });
  const ct = res.headers.get("content-type") ?? "";
  const data: unknown = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = typeof data === "object" && data && "error" in data ? String((data as { error: unknown }).error) : `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

const qs = (params: Record<string, string | number | undefined | null>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
};

export const api = {
  status: () => req<Status>("/status"),
  search: (q: string, limit = 50, filters: Record<string, string | undefined> = {}) => req<SearchResult>(`/search${qs({ q, limit, ...filters })}`),
  moment: (eventId: string) => req<MomentResult>(`/moment/${encodeURIComponent(eventId)}`),
  timeline: (from: string, to: string, limit = 1000, filters: QueryFilters = {}) => req<TimelineDetailed>(`/timeline/detailed${qs({ ...filters, from, to, limit })}`),
  facets: (days = 30) => req<Facets>(`/facets${qs({ days })}`),
  models: () => req<ModelStatus>("/models"),
  startModel: () => req<ModelStatus>("/models/start", { method: "POST" }),
  pullModel: (model?: string) => req<ModelStatus>("/models/pull", { method: "POST", body: JSON.stringify({ model }) }),
  entities: (limit = 6) => req<Entity[]>(`/entities${qs({ limit })}`),
  commitments: () => req<Commitment[]>("/commitments"),
  setCommitment: (id: string, status: "done" | "dismissed" | "open") => req<Commitment>(`/commitments/${encodeURIComponent(id)}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  pulse: (date?: string) => req<Pulse>(`/pulse${qs({ date })}`),
  pending: () => req<Pending>("/pending"),
  notes: (status?: Note["status"]) => req<Note[]>(`/notes${qs({ status })}`),
  approve: (kind: "notes" | "edges", id: string) => req(`/${kind}/${encodeURIComponent(id)}/approve`, { method: "POST" }),
  reject: (kind: "notes" | "edges", id: string) => req(`/${kind}/${encodeURIComponent(id)}/reject`, { method: "POST" }),
  audit: (limit = 300, actor?: string) => req<AuditEntry[]>(`/audit${qs({ limit, actor })}`),
  policy: () => req<Policy>("/policy"),
  setPolicy: (patch: Partial<Policy>) => req<Policy>("/policy", { method: "PUT", body: JSON.stringify(patch) }),
  ask: (question: string) => req<AskResult>("/ask", { method: "POST", body: JSON.stringify({ question }) }),
  setCloudKey: (apiKey: string) => req<{ hasKey: boolean; keyHint: string | null }>("/cloud/key", { method: "PUT", body: JSON.stringify({ apiKey }) }),
  deleteCloudKey: () => req<{ hasKey: boolean; keyHint: string | null }>("/cloud/key", { method: "DELETE" }),
  capture: (action: "pause" | "resume", minutes = 60) => req<{ paused: boolean }>(`/capture/${action}`, { method: "POST", body: JSON.stringify({ minutes }) }),
  eventsByIds: async (ids: string[]): Promise<Event[]> => {
    // No batch endpoint yet; moments are cheap and cached by the browser.
    const out: Event[] = [];
    for (const id of ids.slice(0, 12)) {
      try {
        out.push((await api.moment(id)).focus);
      } catch {
        /* expired */
      }
    }
    return out;
  },
};
export { ApiError };
