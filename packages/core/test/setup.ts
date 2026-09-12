// Point every core test at a fresh, disposable data dir before @brainlog/core is imported.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.BRAIN_DATA_DIR = mkdtempSync(join(tmpdir(), "brainlog-core-test-"));
process.env.BRAINLOG_HOME = join(process.env.BRAIN_DATA_DIR, "home");
process.env.LOG_LEVEL = "error";
process.env.BRAINLOG_KEYCHAIN_SERVICE = "io.brainlog.test";
process.env.BRAINLOG_NO_KEYCHAIN = "1";
