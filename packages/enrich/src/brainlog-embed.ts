/**
 * Canonical Brainlogs embeddings: 384 dims, int8 (ADR 0005).
 * Backends: Ollama nomic-embed-text (Matryoshka-truncated), transformers.js bge-small,
 * and a deterministic feature-hashing embedder used as a last resort and in tests.
 */
import { createHash } from "node:crypto";
import { config, getDb, getSqlite, log } from "@brainlog/core";
import { brainlogSchema } from "@brainlog/core";
import { eq } from "drizzle-orm";
import { embedText } from "./embeddings.js";

export const CANONICAL_DIMS = 384;

export type Embedder = (text: string) => Promise<Float32Array | null>;

export function truncateAndNormalize(vec: ArrayLike<number>, dims = CANONICAL_DIMS): Float32Array {
  const out = new Float32Array(dims);
  const n = Math.min(dims, vec.length);
  let norm = 0;
  for (let i = 0; i < n; i++) {
    out[i] = vec[i]!;
    norm += out[i]! * out[i]!;
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < n; i++) out[i] = out[i]! / norm;
  return out;
}

/** Symmetric int8 quantisation of a unit vector (scale 127). */
export function quantizeInt8(vec: Float32Array): Int8Array {
  const out = new Int8Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = Math.max(-127, Math.min(127, Math.round(vec[i]! * 127)));
  return out;
}

/** Deterministic bag-of-words feature hashing. No model needed; good enough for exact-ish lexical overlap. */
export const hashEmbedder: Embedder = async (text) => {
  const vec = new Float32Array(CANONICAL_DIMS);
  const tokens = text.toLowerCase().match(/[a-z0-9][a-z0-9_./-]{1,}/g) ?? [];
  if (tokens.length === 0) return null;
  for (const tok of tokens) {
    const h = createHash("sha1").update(tok).digest();
    const idx = h.readUInt32BE(0) % CANONICAL_DIMS;
    const sign = h[4]! & 1 ? 1 : -1;
    vec[idx] = vec[idx]! + sign;
  }
  return truncateAndNormalize(vec);
};

/** Model-backed embedder (Ollama, then transformers.js). Returns null when neither is available. */
export const modelEmbedder: Embedder = async (text) => {
  try {
    const raw = await embedText(text);
    if (!raw || raw.length === 0) return null;
    return truncateAndNormalize(raw);
  } catch (e) {
    log.debug("model embedder unavailable", { err: String(e) });
    return null;
  }
};

let defaultEmbedder: Embedder = modelEmbedder;
export function setDefaultEmbedder(e: Embedder): void {
  defaultEmbedder = e;
}
export function getDefaultEmbedder(): Embedder {
  return defaultEmbedder;
}

export async function embedForBrainlog(text: string, embedder = defaultEmbedder): Promise<Int8Array | null> {
  const v = await embedder(text);
  return v ? quantizeInt8(v) : null;
}

/** Embed chunks with `embedded = 0`, write to chunk_vec, mark done. Distinct hashes are embedded once. */
export async function embedPendingBrainlogChunks(opts: { limit?: number; embedder?: Embedder } = {}): Promise<{ embedded: number; reused: number; failed: number }> {
  const db = getDb();
  const sqlite = getSqlite();
  const limit = opts.limit ?? 500;
  const embedder = opts.embedder ?? defaultEmbedder;
  const pending = db.select().from(brainlogSchema.chunks).where(eq(brainlogSchema.chunks.embedded, false)).limit(limit).all();
  const insert = sqlite.prepare("INSERT OR REPLACE INTO chunk_vec(chunk_id, embedding) VALUES (?, vec_int8(?))");
  const byHash = new Map<string, Int8Array>();
  let embedded = 0;
  let reused = 0;
  let failed = 0;
  for (const c of pending) {
    let vec = byHash.get(c.hash);
    if (vec) reused++;
    else {
      const v = await embedForBrainlog(c.text, embedder);
      if (!v) {
        failed++;
        continue;
      }
      vec = v;
      byHash.set(c.hash, vec);
      embedded++;
    }
    insert.run(c.id, Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength));
    db.update(brainlogSchema.chunks).set({ embedded: true }).where(eq(brainlogSchema.chunks.id, c.id)).run();
  }
  if (pending.length) log.info("Brainlogs chunks embedded", { embedded, reused, failed });
  return { embedded, reused, failed };
}
