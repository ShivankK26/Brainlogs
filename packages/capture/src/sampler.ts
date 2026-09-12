import { sha256, type RegionState } from "@brainlog/core";
import type { AppClass } from "./classify.js";
import { newLines, normalizeForHash } from "./diff.js";

export type SampleInput = {
  ts: string;
  app: string;
  windowTitle: string;
  url: string | null;
  text: string;
  /** true when the record carries no captured text, only a title/url */
  titleOnly: boolean;
  cls: AppClass;
};

export type SkipReason = "empty" | "unchanged" | "same_session" | "too_soon" | "no_new_lines";
export type SampleDecision =
  | { action: "skip"; reason: SkipReason }
  | { action: "store"; text: string; textHash: string; regionKey: string };

export type SamplerOptions = { editorIntervalMs?: number };

export function regionKey(app: string, windowTitle: string, url: string | null, cls: AppClass): string {
  const a = app.toLowerCase().trim();
  return cls === "browser" && url ? `${a}::${url}` : `${a}::${windowTitle.trim()}`;
}

/**
 * Sampling and dedup rules from §7, applied per capture region
 * (app + window title, or app + URL for browsers):
 * - identical text → skip
 * - browsers → once per URL per focus session
 * - terminals/editors → on tab switch, or every 30 s if changed; only new lines are stored
 * - chat → only lines (messages) not seen before in that region
 * Title-only records (window focus) are stored again on re-focus so the timeline keeps app switches.
 */
export class Sampler {
  private lastKey: string | null = null;
  private sessionSeq: number;
  readonly changed = new Map<string, RegionState>();
  private readonly editorIntervalMs: number;

  constructor(
    private readonly states: Map<string, RegionState>,
    opts: SamplerOptions = {},
  ) {
    this.editorIntervalMs = opts.editorIntervalMs ?? 30_000;
    this.sessionSeq = Math.max(0, ...[...states.values()].map((s) => s.sessionSeq));
  }

  decide(input: SampleInput): SampleDecision {
    const text = input.text.trim();
    if (!text) return { action: "skip", reason: "empty" };
    const key = regionKey(input.app, input.windowTitle, input.url, input.cls);
    const switched = this.lastKey !== key;
    if (switched) this.sessionSeq++;
    this.lastKey = key;
    const prev = this.states.get(key);
    const hash = sha256(normalizeForHash(text));

    if (prev && prev.lastHash === hash && !(input.titleOnly && switched)) return { action: "skip", reason: "unchanged" };

    let storeText = text;
    switch (input.cls) {
      case "browser":
        if (prev && !switched && prev.sessionSeq === this.sessionSeq) return { action: "skip", reason: "same_session" };
        break;
      case "terminal":
      case "editor": {
        if (prev && !input.titleOnly) {
          const lines = newLines(prev.lastText, text);
          if (lines.length === 0) return { action: "skip", reason: "no_new_lines" };
          const elapsed = Date.parse(input.ts) - Date.parse(prev.lastTs);
          if (!switched && elapsed < this.editorIntervalMs) return { action: "skip", reason: "too_soon" };
          storeText = lines.join("\n");
        }
        break;
      }
      case "chat": {
        const lines = newLines(prev?.lastText ?? "", text);
        if (lines.length === 0) return { action: "skip", reason: "no_new_lines" };
        storeText = lines.join("\n");
        break;
      }
      default:
        break;
    }

    const next: RegionState = { key, app: input.app, lastHash: hash, lastTs: input.ts, lastText: text, sessionSeq: this.sessionSeq };
    this.states.set(key, next);
    this.changed.set(key, next);
    return { action: "store", text: storeText, textHash: sha256(normalizeForHash(storeText)), regionKey: key };
  }
}
