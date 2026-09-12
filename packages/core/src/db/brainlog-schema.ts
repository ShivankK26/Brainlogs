/**
 * Brainlog canonical tables (ADR 0003). Mirrors the zod models in @brainlog/types.
 * FTS5 (`chunks_fts`) and vec0 (`chunk_vec`) virtual tables live in custom migrations
 * under packages/core/drizzle because drizzle-kit cannot describe them.
 */
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const nowDefault = () => text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    ts: text("ts").notNull(),
    app: text("app").notNull(),
    bundleId: text("bundle_id"),
    windowTitle: text("window_title").notNull().default(""),
    url: text("url"),
    domain: text("domain"),
    text: text("text").notNull(),
    textHash: text("text_hash").notNull(),
    sourceKind: text("source_kind").notNull(),
    sensitivity: text("sensitivity").notNull().default("none"),
    expiresAt: text("expires_at").notNull(),
    createdAt: nowDefault(),
  },
  (t) => ({
    ts: index("events_ts").on(t.ts),
    hash: index("events_text_hash").on(t.textHash),
    app: index("events_app").on(t.app),
    domain: index("events_domain").on(t.domain),
    expires: index("events_expires_at").on(t.expiresAt),
  }),
);

export const chunks = sqliteTable(
  "chunks",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull().default(0),
    text: text("text").notNull(),
    hash: text("hash").notNull(),
    embedded: integer("embedded", { mode: "boolean" }).notNull().default(false),
  },
  (t) => ({
    event: index("chunks_event_id").on(t.eventId),
    hash: index("chunks_hash").on(t.hash),
    embedded: index("chunks_embedded").on(t.embedded),
  }),
);

/** Last-seen state per capture region, used for dedup and line diffs. Bounded by the number of distinct windows/URLs. */
export const captureRegions = sqliteTable("capture_regions", {
  key: text("key").primaryKey(),
  app: text("app").notNull(),
  lastHash: text("last_hash").notNull(),
  lastTs: text("last_ts").notNull(),
  lastText: text("last_text").notNull().default(""),
  sessionSeq: integer("session_seq").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

export const ingestCursors = sqliteTable("ingest_cursors", {
  file: text("file").primaryKey(),
  offset: integer("offset").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

export const entities = sqliteTable(
  "entities",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    nameNorm: text("name_norm").notNull(),
    aliasesJson: text("aliases_json").notNull().default("[]"),
    firstSeen: text("first_seen").notNull(),
    lastSeen: text("last_seen").notNull(),
    mentionCount: integer("mention_count").notNull().default(0),
  },
  (t) => ({
    kindName: uniqueIndex("entities_kind_name_norm").on(t.kind, t.nameNorm),
    lastSeen: index("entities_last_seen").on(t.lastSeen),
  }),
);

export const eventEntities = sqliteTable(
  "event_entities",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.eventId, t.entityId] }),
    entity: index("event_entities_entity").on(t.entityId),
  }),
);

export const edges = sqliteTable(
  "edges",
  {
    id: text("id").primaryKey(),
    fromEntity: text("from_entity")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    toEntity: text("to_entity").references(() => entities.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    weight: real("weight").notNull().default(1),
    evidenceJson: text("evidence_json").notNull().default("[]"),
    status: text("status").notNull().default("proposed"),
    proposedBy: text("proposed_by").notNull().default("system"),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    from: index("edges_from").on(t.fromEntity),
    to: index("edges_to").on(t.toEntity),
    status: index("edges_status").on(t.status),
  }),
);

export const commitments = sqliteTable(
  "commitments",
  {
    id: text("id").primaryKey(),
    text: text("text").notNull(),
    fromParty: text("from_party").notNull(),
    toParty: text("to_party").notNull(),
    dueAt: text("due_at"),
    status: text("status").notNull().default("open"),
    evidenceJson: text("evidence_json").notNull().default("[]"),
    closedByEventId: text("closed_by_event_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    status: index("commitments_status").on(t.status),
    due: index("commitments_due_at").on(t.dueAt),
  }),
);

export const summaries = sqliteTable(
  "summaries",
  {
    id: text("id").primaryKey(),
    period: text("period").notNull(),
    start: text("start").notNull(),
    end: text("end").notNull(),
    markdown: text("markdown").notNull(),
    provenanceJson: text("provenance_json").notNull().default("[]"),
    createdAt: nowDefault(),
  },
  (t) => ({
    periodStart: uniqueIndex("summaries_period_start").on(t.period, t.start),
  }),
);

export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    text: text("text").notNull(),
    repo: text("repo"),
    entityIdsJson: text("entity_ids_json").notNull().default("[]"),
    author: text("author").notNull(),
    status: text("status").notNull().default("proposed"),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    status: index("notes_status").on(t.status),
    author: index("notes_author").on(t.author),
  }),
);

export const auditEntries = sqliteTable(
  "audit_entries",
  {
    id: text("id").primaryKey(),
    ts: text("ts").notNull(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    scope: text("scope").notNull().default(""),
    result: text("result").notNull(),
    detail: text("detail").notNull().default(""),
  },
  (t) => ({
    ts: index("audit_entries_ts").on(t.ts),
    actor: index("audit_entries_actor").on(t.actor),
  }),
);

/** Single-row table (`id = 'default'`). The JSON is validated by @brainlog/types Policy on every read. */
export const policyTable = sqliteTable("policy", {
  id: text("id").primaryKey(),
  json: text("json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Per-job progress markers, e.g. the graph extractor's last processed event ts. */
export const jobWatermarks = sqliteTable("job_watermarks", {
  job: text("job").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});
