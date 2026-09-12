import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.BRAIN_DATA_DIR = mkdtempSync(join(tmpdir(), "brainlog-mcp-test-"));
process.env.BRAINLOG_HOME = join(process.env.BRAIN_DATA_DIR, "home");
process.env.LOG_LEVEL = "error";
process.env.OLLAMA_BASE_URL = "http://127.0.0.1:1";
