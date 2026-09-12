/** Lines present in `next` that were not in `prev` (order preserved, whitespace-normalised, duplicates within `next` kept once). */
export function newLines(prev: string, next: string): string[] {
  const seen = new Set(splitLines(prev));
  const out: string[] = [];
  const emitted = new Set<string>();
  for (const line of splitLines(next)) {
    if (seen.has(line) || emitted.has(line)) continue;
    emitted.add(line);
    out.push(line);
  }
  return out;
}

export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);
}

export function normalizeForHash(text: string): string {
  return splitLines(text).join("\n").toLowerCase();
}
