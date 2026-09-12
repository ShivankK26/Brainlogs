import type { Commitment, Event } from "@brainlog/types";

export function table(rows: string[][], opts: { header?: string[]; max?: number[] } = {}): string {
  const all = opts.header ? [opts.header, ...rows] : rows;
  if (all.length === 0) return "";
  const cols = Math.max(...all.map((r) => r.length));
  const widths = Array.from({ length: cols }, (_, i) => Math.min(opts.max?.[i] ?? 60, Math.max(...all.map((r) => (r[i] ?? "").length))));
  const fmt = (r: string[]) => r.map((c, i) => trunc(c ?? "", widths[i]!).padEnd(widths[i]!)).join("  ").trimEnd();
  const out = [fmt(all[0]!)];
  if (opts.header) out.push(widths.map((w) => "─".repeat(w)).join("  "));
  for (const r of all.slice(1)) out.push(fmt(r));
  return out.join("\n");
}

export function trunc(s: string, n: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, Math.max(0, n - 1))}…` : one;
}

export function when(ts: string): string {
  const d = new Date(ts);
  return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function eventRow(e: Event): string[] {
  return [shortId(e.id), when(e.ts), e.app, trunc(e.windowTitle, 36), trunc(e.text.split("\n")[0] ?? "", 70)];
}

export function commitmentRow(c: Commitment): string[] {
  return [shortId(c.id), c.status, trunc(c.text, 48), `${c.fromParty} → ${c.toParty}`, c.dueAt ? c.dueAt.slice(0, 10) : "—"];
}
