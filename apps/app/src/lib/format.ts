import type { Commitment, Entity, Event } from "./types";

export const memId = (id: string) => `MEM-${id.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
export const cmtId = (id: string) => `CMT-${id.replace(/-/g, "").slice(0, 4).toUpperCase()}`;

export function dayLabel(ts: string): string {
  return new Date(ts).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
export function timeLabel(ts: string): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}
export function dateLabel(ts: string): string {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
export function dayKey(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function hours(ms: number): string {
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  return h >= 10 ? `${Math.round(h)}h` : `${Math.round(h * 10) / 10}h`;
}
export function dateLabelUTC(ts: string): string {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}
export function bytes(n: number): string {
  if (n > 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n > 1e6) return `${Math.round(n / 1e6)} MB`;
  return `${Math.round(n / 1e3)} KB`;
}
export function relMinutes(from: string, to: string): string {
  const m = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 60_000));
  return m >= 60 ? `+${Math.round(m / 60)} h` : `+${m} min`;
}
export function compact(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);
}

export const KIND_COLOR: Record<Entity["kind"], string> = {
  repo: "var(--brand)",
  project: "var(--teal)",
  person: "var(--purple)",
  branch: "var(--amber)",
  topic: "var(--green)",
  org: "var(--red)",
  doc: "var(--t2)",
};

export type Priority = "low" | "med" | "high" | "urgent";
export type EventStatus = "open" | "prog" | "done" | "block";

const ERRORISH = /\b(error|failed|exception|panic|traceback|fatal)\b/i;

/** Heuristic until the graph links events to commitments (Phase 4). */
export function eventStatus(e: Event, linked: Commitment[]): EventStatus {
  if (linked.some((c) => c.status === "overdue")) return "block";
  if (linked.some((c) => c.status === "open" || c.status === "waiting" || c.status === "stalled")) return "open";
  if (e.sourceKind === "terminal" && ERRORISH.test(e.text)) return "prog";
  return "done";
}
export function eventPriority(e: Event, linked: Commitment[]): Priority {
  if (linked.some((c) => c.status === "overdue")) return "urgent";
  if (e.sourceKind === "terminal" && ERRORISH.test(e.text)) return "high";
  if (e.sensitivity !== "none") return "med";
  return "low";
}
export const STATUS_LABEL: Record<EventStatus, string> = { open: "Open", prog: "In progress", done: "Seen", block: "Overdue" };

export function eventTitle(e: Event): string {
  const first = e.text.split("\n").find((l) => l.trim()) ?? "";
  return first.trim() || e.windowTitle || e.url || e.app;
}
export function sourceLabel(e: Event): string {
  return e.domain ?? e.windowTitle ?? e.app;
}
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase() : name.slice(0, 2).toUpperCase();
}
