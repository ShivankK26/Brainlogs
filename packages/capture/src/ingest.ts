import { basename } from "node:path";
import type { Event, Policy } from "@brainlog/types";
import {
  chunkText,
  config,
  ensureDataDir,
  getPolicy,
  insertEvent,
  loadIngestCursors,
  loadRegionStates,
  log,
  newId,
  saveIngestCursors,
  saveRegionStates,
} from "@brainlog/core";
import { captureGate } from "@brainlog/policy";
import { classifyApp, domainFromUrl, sourceKindFor } from "./classify.js";
import { Sampler, type SkipReason } from "./sampler.js";
import { listSpoolFiles, parseSpoolLine, readNewLines } from "./spool.js";

export type IngestResult = {
  files: number;
  lines: number;
  inserted: number;
  invalid: number;
  skipped: Record<SkipReason, number>;
  dropped: { blocked_app: number; blocked_domain: number; credential: number };
};

export type IngestOptions = {
  spoolDir?: string;
  policy?: Policy;
  platform?: NodeJS.Platform;
  /** Skip persisting cursors (used by tests that re-read a fixture). */
  persistCursors?: boolean;
};

const SELF = /brainlog/i;

function expiresAt(ts: string, retentionDays: number): string {
  return new Date(Date.parse(ts) + retentionDays * 86_400_000).toISOString();
}

/**
 * Tail the JSONL spool written by the capture engine and turn records into Brainlogs events.
 * Order per record: validate → policy gate (drop before disk) → sampler (dedup/diff/session) → insert.
 * Logs counts only, never captured text (§16).
 */
export async function ingestSpool(opts: IngestOptions = {}): Promise<IngestResult> {
  ensureDataDir();
  const spoolDir = opts.spoolDir ?? config.spoolDir;
  const policy = opts.policy ?? getPolicy();
  const platform = opts.platform ?? process.platform;
  const cursors = loadIngestCursors();
  const sampler = new Sampler(loadRegionStates());
  const result: IngestResult = {
    files: 0,
    lines: 0,
    inserted: 0,
    invalid: 0,
    skipped: { empty: 0, unchanged: 0, same_session: 0, too_soon: 0, no_new_lines: 0 },
    dropped: { blocked_app: 0, blocked_domain: 0, credential: 0 },
  };

  for (const path of listSpoolFiles(spoolDir)) {
    result.files++;
    const file = basename(path);
    const { lines, newOffset } = readNewLines(path, cursors[file] ?? 0);
    cursors[file] = newOffset;
    for (const line of lines) {
      result.lines++;
      const rec = parseSpoolLine(line);
      if (!rec) {
        result.invalid++;
        continue;
      }
      const app = (rec.app ?? rec.exe ?? "").trim();
      if (!app || SELF.test(`${app} ${rec.exe ?? ""}`)) {
        result.skipped.empty++;
        continue;
      }
      const cls = classifyApp(rec);
      const windowTitle = (rec.window_title ?? "").trim();
      const url = rec.url?.trim() || null;
      const rawText = rec.text?.trim() ?? "";
      const titleOnly = rawText.length === 0;
      const text = rawText || windowTitle || url || "";
      if (!text) {
        result.skipped.empty++;
        continue;
      }
      const domain = rec.domain?.toLowerCase() ?? domainFromUrl(url);

      const gate = captureGate(policy, { app, exe: rec.exe, bundleId: rec.bundle_id, domain, url, text, windowTitle, chat: cls === "chat" });
      if (gate.action === "drop") {
        result.dropped[gate.reason]++;
        continue;
      }

      const decision = sampler.decide({ ts: rec.ts, app, windowTitle, url, text, titleOnly, cls });
      if (decision.action === "skip") {
        result.skipped[decision.reason]++;
        continue;
      }

      const ts = new Date(rec.ts).toISOString();
      const event: Event = {
        id: newId(),
        ts,
        app,
        bundleId: rec.bundle_id ?? null,
        windowTitle,
        url,
        domain,
        text: decision.text,
        textHash: decision.textHash,
        sourceKind: sourceKindFor(rec, cls, platform),
        sensitivity: gate.sensitivity,
        expiresAt: expiresAt(ts, policy.retentionDays),
      };
      insertEvent(event, chunkText(decision.text));
      result.inserted++;
    }
  }

  if (sampler.changed.size > 0) saveRegionStates(sampler.changed.values());
  if (opts.persistCursors !== false) saveIngestCursors(cursors);
  log.info("Capture ingest", { files: result.files, lines: result.lines, inserted: result.inserted, invalid: result.invalid, dropped: result.dropped });
  return result;
}
