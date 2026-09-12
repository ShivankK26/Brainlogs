import { getEventById } from "@brainlog/core";
import type { Event } from "@brainlog/types";
import { eventsBetween } from "./store.js";
import { visible, type Perms } from "./filters.js";
import type { MomentResult } from "./types.js";

export function regionOf(e: Event): string {
  return `${e.app.toLowerCase()}::${e.url ?? e.windowTitle}`;
}

/**
 * Rebuild the moment around an event: what else was on screen (the closest capture
 * from every other window/URL within the window), and what happened before and after.
 */
export function moment(input: { eventId: string; windowMs: number }, perms: Perms): MomentResult | null {
  const focus = getEventById(input.eventId);
  if (!focus || !visible(focus, perms)) return null;
  const t = Date.parse(focus.ts);
  const from = new Date(t - input.windowMs).toISOString();
  const to = new Date(t + input.windowMs).toISOString();
  const all = eventsBetween(from, to, 5000).filter((e) => e.id !== focus.id && visible(e, perms));
  const before = all.filter((e) => e.ts <= focus.ts);
  const after = all.filter((e) => e.ts > focus.ts);

  const focusRegion = regionOf(focus);
  const closest = new Map<string, { e: Event; dt: number }>();
  for (const e of all) {
    const r = regionOf(e);
    if (r === focusRegion) continue;
    const dt = Math.abs(Date.parse(e.ts) - t);
    const cur = closest.get(r);
    if (!cur || dt < cur.dt) closest.set(r, { e, dt });
  }
  const alsoOnScreen = [...closest.values()].sort((a, b) => a.dt - b.dt).map((x) => x.e);
  return { focus, alsoOnScreen, before, after };
}
