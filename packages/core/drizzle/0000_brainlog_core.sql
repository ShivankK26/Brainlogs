CREATE TABLE `audit_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`ts` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`scope` text DEFAULT '' NOT NULL,
	`result` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_entries_ts` ON `audit_entries` (`ts`);--> statement-breakpoint
CREATE INDEX `audit_entries_actor` ON `audit_entries` (`actor`);--> statement-breakpoint
CREATE TABLE `capture_regions` (
	`key` text PRIMARY KEY NOT NULL,
	`app` text NOT NULL,
	`last_hash` text NOT NULL,
	`last_ts` text NOT NULL,
	`last_text` text DEFAULT '' NOT NULL,
	`session_seq` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`idx` integer DEFAULT 0 NOT NULL,
	`text` text NOT NULL,
	`hash` text NOT NULL,
	`embedded` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chunks_event_id` ON `chunks` (`event_id`);--> statement-breakpoint
CREATE INDEX `chunks_hash` ON `chunks` (`hash`);--> statement-breakpoint
CREATE INDEX `chunks_embedded` ON `chunks` (`embedded`);--> statement-breakpoint
CREATE TABLE `commitments` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`from_party` text NOT NULL,
	`to_party` text NOT NULL,
	`due_at` text,
	`status` text DEFAULT 'open' NOT NULL,
	`evidence_json` text DEFAULT '[]' NOT NULL,
	`closed_by_event_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `commitments_status` ON `commitments` (`status`);--> statement-breakpoint
CREATE INDEX `commitments_due_at` ON `commitments` (`due_at`);--> statement-breakpoint
CREATE TABLE `edges` (
	`id` text PRIMARY KEY NOT NULL,
	`from_entity` text NOT NULL,
	`to_entity` text,
	`kind` text NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`evidence_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`proposed_by` text DEFAULT 'system' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`from_entity`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_entity`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `edges_from` ON `edges` (`from_entity`);--> statement-breakpoint
CREATE INDEX `edges_to` ON `edges` (`to_entity`);--> statement-breakpoint
CREATE INDEX `edges_status` ON `edges` (`status`);--> statement-breakpoint
CREATE TABLE `entities` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`name_norm` text NOT NULL,
	`aliases_json` text DEFAULT '[]' NOT NULL,
	`first_seen` text NOT NULL,
	`last_seen` text NOT NULL,
	`mention_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entities_kind_name_norm` ON `entities` (`kind`,`name_norm`);--> statement-breakpoint
CREATE INDEX `entities_last_seen` ON `entities` (`last_seen`);--> statement-breakpoint
CREATE TABLE `event_entities` (
	`event_id` text NOT NULL,
	`entity_id` text NOT NULL,
	PRIMARY KEY(`event_id`, `entity_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_entities_entity` ON `event_entities` (`entity_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`ts` text NOT NULL,
	`app` text NOT NULL,
	`bundle_id` text,
	`window_title` text DEFAULT '' NOT NULL,
	`url` text,
	`domain` text,
	`text` text NOT NULL,
	`text_hash` text NOT NULL,
	`source_kind` text NOT NULL,
	`sensitivity` text DEFAULT 'none' NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_ts` ON `events` (`ts`);--> statement-breakpoint
CREATE INDEX `events_text_hash` ON `events` (`text_hash`);--> statement-breakpoint
CREATE INDEX `events_app` ON `events` (`app`);--> statement-breakpoint
CREATE INDEX `events_domain` ON `events` (`domain`);--> statement-breakpoint
CREATE INDEX `events_expires_at` ON `events` (`expires_at`);--> statement-breakpoint
CREATE TABLE `ingest_cursors` (
	`file` text PRIMARY KEY NOT NULL,
	`offset` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `job_watermarks` (
	`job` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`repo` text,
	`entity_ids_json` text DEFAULT '[]' NOT NULL,
	`author` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notes_status` ON `notes` (`status`);--> statement-breakpoint
CREATE INDEX `notes_author` ON `notes` (`author`);--> statement-breakpoint
CREATE TABLE `policy` (
	`id` text PRIMARY KEY NOT NULL,
	`json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`period` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`markdown` text NOT NULL,
	`provenance_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `summaries_period_start` ON `summaries` (`period`,`start`);