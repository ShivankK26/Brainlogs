import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { join } from "node:path";
import { SpoolRecord } from "@brainlog/types";

export function listSpoolFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith("obs-") && f.endsWith(".jsonl"))
    .sort()
    .map((f) => join(dir, f));
}

/** Read bytes appended since `offset`. A trailing partial line is left for the next run. */
export function readNewLines(filePath: string, offset: number): { lines: string[]; newOffset: number } {
  const size = statSync(filePath).size;
  if (offset >= size) return { lines: [], newOffset: size < offset ? 0 : offset };
  const fd = openSync(filePath, "r");
  try {
    const len = size - offset;
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, offset);
    let text = buf.toString("utf8");
    let consumed = len;
    if (!text.endsWith("\n")) {
      const cut = text.lastIndexOf("\n");
      if (cut < 0) return { lines: [], newOffset: offset };
      consumed = Buffer.byteLength(text.slice(0, cut + 1), "utf8");
      text = text.slice(0, cut + 1);
    }
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    return { lines, newOffset: offset + consumed };
  } finally {
    closeSync(fd);
  }
}

export function parseSpoolLine(line: string): SpoolRecord | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  const parsed = SpoolRecord.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
