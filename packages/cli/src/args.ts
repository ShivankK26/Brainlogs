export type Parsed = { positional: string[]; flags: Record<string, string | boolean> };

/** Tiny argv parser: `--key value`, `--key=value`, `--flag`, everything else positional. */
export function parseArgs(argv: string[]): Parsed {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 0) flags[a.slice(2, eq)] = a.slice(eq + 1);
      else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          flags[a.slice(2)] = next;
          i++;
        } else flags[a.slice(2)] = true;
      }
    } else positional.push(a);
  }
  return { positional, flags };
}

export function flagStr(flags: Parsed["flags"], key: string): string | undefined {
  const v = flags[key];
  return typeof v === "string" ? v : undefined;
}

/** `30d`, `12h`, `45m` → milliseconds. */
export function parseDuration(s: string): number {
  const m = s.trim().match(/^(\d+)\s*([dhm])$/i);
  if (!m) throw new Error(`Cannot parse duration "${s}" (use 30d, 12h or 45m)`);
  const n = Number(m[1]);
  const unit = m[2]!.toLowerCase();
  return n * (unit === "d" ? 86_400_000 : unit === "h" ? 3_600_000 : 60_000);
}
