import type { Highlight } from "./types.js";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Up to `max` snippets around term matches, with match ranges relative to each snippet. */
export function highlight(text: string, terms: string[], opts: { max?: number; radius?: number } = {}): Highlight[] {
  const max = opts.max ?? 2;
  const radius = opts.radius ?? 80;
  if (!text || terms.length === 0) return [];
  const re = new RegExp(`(${terms.map(escapeRe).join("|")})`, "giu");
  const positions: Array<[number, number]> = [];
  for (const m of text.matchAll(re)) positions.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  if (positions.length === 0) return [];
  const out: Highlight[] = [];
  let i = 0;
  while (i < positions.length && out.length < max) {
    const start = Math.max(0, positions[i]![0] - radius);
    const end = Math.min(text.length, positions[i]![1] + radius);
    const matches: Array<[number, number]> = [];
    while (i < positions.length && positions[i]![1] <= end) {
      matches.push([positions[i]![0] - start, positions[i]![1] - start]);
      i++;
    }
    const snippet = (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
    const shift = start > 0 ? 1 : 0;
    out.push({ snippet, matches: matches.map(([a, b]) => [a + shift, b + shift]) });
  }
  return out;
}
