import type { ReactNode } from "react";
import type { Entity } from "../lib/types";
import { KIND_COLOR, type EventStatus, type Priority } from "../lib/format";

export const St = ({ s }: { s: EventStatus | "wait" | "dismissed" }) => <span className={`st ${s}`} aria-hidden />;
export const Pri = ({ p }: { p: Priority }) => (
  <span className={`pri ${p}`} title={p}><b /><b /><b /></span>
);
export const Lbl = ({ name, color }: { name: string; color: string }) => (
  <span className="lbl"><i style={{ background: color }} />{name}</span>
);
export const EntityLbls = ({ entities, max = 3 }: { entities: Entity[]; max?: number }) => (
  <>{entities.slice(0, max).map((e) => <Lbl key={e.id} name={e.name} color={KIND_COLOR[e.kind]} />)}</>
);
export const Pill = ({ color, children }: { color?: string; children: ReactNode }) => (
  <span className="pill">{color ? <i style={{ background: color }} /> : null}{children}</span>
);
export const Switch = ({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) => (
  <button className="sw" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} />
);

/** Render a highlight snippet with <mark> around matched ranges. */
export function Marked({ text, matches }: { text: string; matches: Array<[number, number]> }) {
  if (matches.length === 0) return <>{text}</>;
  const out: ReactNode[] = [];
  let i = 0;
  matches.forEach(([a, b], k) => {
    if (a > i) out.push(text.slice(i, a));
    out.push(<mark key={k}>{text.slice(a, b)}</mark>);
    i = b;
  });
  if (i < text.length) out.push(text.slice(i));
  return <>{out}</>;
}

/** Highlight query terms in plain text (client-side, for palette rows). */
export function markTerms(text: string, terms: string[]): ReactNode {
  if (terms.length === 0) return text;
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const parts = text.split(re);
  return parts.map((p, i) => (i % 2 === 1 ? <mark key={i}>{p}</mark> : p));
}
