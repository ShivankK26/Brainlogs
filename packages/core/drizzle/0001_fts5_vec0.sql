-- Custom migration: FTS5 over chunks (external content) and the sqlite-vec vec0 table.
-- The sqlite-vec extension MUST be loaded on the connection before this runs; migrate() asserts it.
CREATE VIRTUAL TABLE IF NOT EXISTS `chunks_fts` USING fts5(
  `text`,
  content='chunks',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `chunks_ai` AFTER INSERT ON `chunks` BEGIN
  INSERT INTO `chunks_fts`(rowid, `text`) VALUES (new.rowid, new.`text`);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `chunks_ad` AFTER DELETE ON `chunks` BEGIN
  INSERT INTO `chunks_fts`(`chunks_fts`, rowid, `text`) VALUES ('delete', old.rowid, old.`text`);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `chunks_au` AFTER UPDATE ON `chunks` BEGIN
  INSERT INTO `chunks_fts`(`chunks_fts`, rowid, `text`) VALUES ('delete', old.rowid, old.`text`);
  INSERT INTO `chunks_fts`(rowid, `text`) VALUES (new.rowid, new.`text`);
END;
--> statement-breakpoint
CREATE VIRTUAL TABLE IF NOT EXISTS `chunk_vec` USING vec0(
  chunk_id TEXT PRIMARY KEY,
  embedding int8[384]
);
