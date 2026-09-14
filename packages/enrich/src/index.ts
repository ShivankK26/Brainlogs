export { embedText, embedBatch, cosine, lastEmbedMeta } from "./embeddings.js";
export {
  runEnrichPipeline,
  scoreItem,
  scorePending,
  embedUnembeddedItems,
  embedPendingChunks,
  retrieveMemory,
  recordFeedback,
  type RetrievalHit,
} from "./scoring.js";
export {
  CANONICAL_DIMS,
  embedForBrainlog,
  embedForBrainlogWithBackend,
  embedPendingBrainlogChunks,
  hashEmbedder,
  modelEmbedder,
  setDefaultEmbedder,
  getDefaultEmbedder,
  quantizeInt8,
  truncateAndNormalize,
  type Embedder,
  type EmbedBackend,
} from "./brainlog-embed.js";
