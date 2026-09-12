import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.BRAIN_DATA_DIR = mkdtempSync(join(tmpdir(), "brainlog-query-test-"));
process.env.BRAINLOG_HOME = join(process.env.BRAIN_DATA_DIR, "home");
process.env.LOG_LEVEL = "error";
process.env.BRAINLOG_NO_KEYCHAIN = "1";
