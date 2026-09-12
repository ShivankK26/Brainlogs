import type { Entity, Event } from "@brainlog/types";
import type { SearchFilters } from "./types.js";

export type Perms = { readSensitive: boolean };

export function visible(e: Event, perms: Perms): boolean {
  return perms.readSensitive || e.sensitivity === "none";
}

export function matchesFilters(e: Event, f: SearchFilters | undefined, entitiesOf: (id: string) => Entity[]): boolean {
  if (!f) return true;
  if (f.app && e.app.toLowerCase() !== f.app.toLowerCase()) return false;
  if (f.domain) {
    const d = (e.domain ?? "").toLowerCase();
    const want = f.domain.toLowerCase().replace(/^\*\./, "");
    if (!(d === want || d.endsWith(`.${want}`))) return false;
  }
  if (f.from && e.ts < f.from) return false;
  if (f.to && e.ts > f.to) return false;
  if (f.person || f.repo) {
    const ents = entitiesOf(e.id);
    const has = (kind: Entity["kind"], name: string) => ents.some((x) => x.kind === kind && namesOf(x).includes(name.toLowerCase()));
    if (f.person && !has("person", f.person)) return false;
    if (f.repo && !has("repo", f.repo)) return false;
  }
  return true;
}

export function namesOf(e: Entity): string[] {
  return [e.name, ...e.aliases].map((n) => n.toLowerCase());
}
