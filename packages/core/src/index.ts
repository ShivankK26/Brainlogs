export { config, ensureDataDir, ensureMasterKey, normalizeOllamaKeepAlive } from "./config.js";
export {
  ensureApiToken,
  readApiToken,
  apiTokenPath,
  extractBearerToken,
  extractCookieToken,
  apiTokenCookieHeader,
  isValidApiToken,
  corsOriginFor,
  ALLOWED_ORIGINS,
  API_TOKEN_COOKIE,
} from "./api-token.js";
export {
  encrypt,
  decrypt,
  loadSecrets,
  saveSecrets,
  getSecret,
  setSecret,
  deleteSecret,
  sha256,
  contentHash,
} from "./crypto.js";
export { log } from "./log.js";
export {
  getDb,
  getSqlite,
  createDb,
  closeDb,
  backupDb,
  ensureEmbeddingTables,
  isVecReady,
  schema,
} from "./db/client.js";
export * from "./db/schema.js";
export { migrate } from "./db/migrate.js";
export { seed } from "./db/seed.js";
export { runJob, withBackoff, newId, type JobResult } from "./jobs.js";
export { exportCaptureRulesFile } from "./capture-rules-export.js";
export {
  segmentChatCapture,
  selfNamesFromSurface,
  isSelfName,
  isBrowserSurface,
  type ChatSegment,
  type ChatSurface,
  type ChatView,
} from "./chat-thread.js";
export {
  classifySpam,
  isSpam,
  isSpamText,
  type SpamInput,
  type SpamVerdict,
} from "./spam.js";
export {
  matchUserSpamRule,
  matchUserRule,
  isBlockedByUserRules,
  markLoopAsSpam,
  markLoopNotTracking,
  listUserSpamRules,
  listUserTrackingRules,
  deleteUserSpamRule,
  deleteUserTrackingRule,
  addUserSpamRule,
  addUserTrackingRule,
  invalidateUserSpamCache,
  invalidateUserRulesCache,
  formatUserRulesForPrompt,
  type UserSpamRule,
  type UserTrackingRule,
  type UserSpamMatchType,
  type UserRuleMatchType,
  type UserRuleIntent,
  type UserRuleHit,
} from "./user-spam.js";
export {
  recordLearnClassify,
  recordLearnReward,
  linkLearnCard,
  learnGraphFewShot,
  looksLikeMarket,
  type ChatAudience,
  type ChatTopic,
  type LearnClassifyInput,
} from "./learn-graph.js";

// ---- Brainlog (ADR 0003) ----
export * as brainlogSchema from "./db/brainlog-schema.js";
export { assertVecLoaded, SqliteVecNotLoadedError } from "./db/client.js";
export { migrationsFolder } from "./db/migrate.js";
export { chunkText } from "./text/chunk.js";
export {
  insertEvent,
  getEventById,
  getEventsByIds,
  countEvents,
  hasTextHash,
  purgeExpiredEvents,
  deleteEvent,
  rowToEvent,
  type EventRow,
  type PurgeResult,
} from "./repo/events.js";
export {
  loadRegionStates,
  saveRegionStates,
  purgeRegionStates,
  loadIngestCursors,
  saveIngestCursors,
  type RegionState,
} from "./repo/capture-state.js";
export { getPolicy, setPolicy, exportEngineRules } from "./repo/policy.js";
export { writeAudit, updateAudit, listAudit, countAudit } from "./repo/audit.js";
