import { z } from "zod";
import { Id, IsoTimestamp, Sha256Hex } from "./common.js";

export const SourceKind = z.enum(["ax", "ocr", "atspi", "title", "terminal", "connector"]);
export type SourceKind = z.infer<typeof SourceKind>;

/**
 * Sensitivity tag applied by the policy classifier at capture time.
 * `credential` is never stored; it exists in the enum so the classifier can name it.
 */
export const Sensitivity = z.enum(["none", "credential", "financial", "health", "third_party_private"]);
export type Sensitivity = z.infer<typeof Sensitivity>;

/** Raw timeline row. Expires per retention policy. */
export const Event = z.object({
  id: Id,
  ts: IsoTimestamp,
  app: z.string().min(1),
  bundleId: z.string().nullable().default(null),
  windowTitle: z.string().default(""),
  url: z.string().url().nullable().default(null),
  domain: z.string().nullable().default(null),
  text: z.string(),
  textHash: Sha256Hex,
  sourceKind: SourceKind,
  sensitivity: Sensitivity.default("none"),
  expiresAt: IsoTimestamp,
});
export type Event = z.infer<typeof Event>;

/** Dedup'd, chunked text for retrieval. The vector lives in a vec0 virtual table keyed by chunk id. */
export const Chunk = z.object({
  id: Id,
  eventId: Id,
  text: z.string().min(1),
  hash: Sha256Hex,
  /** int8-quantised embedding; absent until the enrich job runs. */
  embedding: z.array(z.number().int().min(-128).max(127)).nullable().default(null),
});
export type Chunk = z.infer<typeof Chunk>;

/**
 * One line of the JSONL spool written by the Rust capture engine.
 * Kept loose on purpose: the engine is versioned separately and may add fields.
 */
export const SpoolRecord = z
  .object({
    ts: IsoTimestamp,
    source: z.enum(["window", "browser", "ocr", "file", "ax", "atspi", "terminal"]),
    app: z.string().optional(),
    exe: z.string().optional(),
    bundle_id: z.string().optional(),
    window_title: z.string().optional(),
    url: z.string().optional(),
    domain: z.string().optional(),
    text: z.string().optional(),
    dwell_ms: z.number().int().nonnegative().optional(),
    redacted: z.boolean().optional(),
    chat: z.boolean().optional(),
    trading: z.boolean().optional(),
    meta: z.record(z.unknown()).optional(),
  })
  .passthrough();
export type SpoolRecord = z.infer<typeof SpoolRecord>;
