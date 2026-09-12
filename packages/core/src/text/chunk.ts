/** Split captured text into retrieval chunks on paragraph and line boundaries, hard-wrapping only when a line is too long. */
export function chunkText(text: string, maxChars = 700): string[] {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];
  const out: string[] = [];
  let buf = "";
  const flush = () => {
    const t = buf.trim();
    if (t) out.push(t);
    buf = "";
  };
  for (const para of clean.split(/\n{2,}/)) {
    for (const line of para.split("\n")) {
      if (line.length > maxChars) {
        flush();
        for (let i = 0; i < line.length; i += maxChars) out.push(line.slice(i, i + maxChars).trim());
        continue;
      }
      if (buf.length + line.length + 1 > maxChars) flush();
      buf += (buf ? "\n" : "") + line;
    }
    if (buf.length > maxChars * 0.6) flush();
    else if (buf) buf += "\n";
  }
  flush();
  return out.filter((c) => c.length > 0);
}
