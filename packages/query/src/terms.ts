const STOP = new Set([
  "i", "the", "a", "an", "in", "did", "do", "what", "why", "when", "where", "was", "were", "is", "are", "saw", "my", "to", "of", "and", "or", "on", "at",
  "stop", "me", "it", "that", "this", "for", "with", "about", "from", "by", "be", "have", "had", "has", "how", "which", "who", "you", "your", "we",
]);

/** Query tokens: lowercase, keep word chars plus `-/._` so repos, branches and file names survive. */
export function tokenize(q: string): string[] {
  const out: string[] = [];
  for (const raw of q.toLowerCase().split(/[^\p{L}\p{N}\-/._#@]+/u)) {
    const t = raw.replace(/^[-/._#@]+|[-/._#@]+$/g, "");
    if (!t || STOP.has(t) || t.length < 2) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** Build an FTS5 MATCH expression: each term quoted, prefix-matched when long enough, OR'd so partial matches still rank. */
export function ftsQuery(terms: string[]): string {
  return terms
    .map((t) => {
      const quoted = `"${t.replace(/"/g, '""')}"`;
      return t.length >= 3 && !/[^a-z0-9]/.test(t) ? `${quoted}*` : quoted;
    })
    .join(" OR ");
}
