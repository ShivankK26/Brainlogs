/** Policy persistence. The Rust engine reads `capture-rules.json`, so every save also exports it. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { DEFAULT_POLICY, Policy } from "@brainlog/types";
import { getDb } from "../db/client.js";
import { policyTable } from "../db/brainlog-schema.js";
import { config, ensureDataDir } from "../config.js";

const ROW_ID = "default";

export function getPolicy(): Policy {
  const row = getDb().select().from(policyTable).where(eq(policyTable.id, ROW_ID)).get();
  if (!row) return DEFAULT_POLICY;
  const parsed = Policy.safeParse(JSON.parse(row.json));
  return parsed.success ? parsed.data : DEFAULT_POLICY;
}

export function setPolicy(next: Policy): Policy {
  const policy = Policy.parse(next);
  const now = new Date().toISOString();
  getDb()
    .insert(policyTable)
    .values({ id: ROW_ID, json: JSON.stringify(policy), updatedAt: now })
    .onConflictDoUpdate({ target: policyTable.id, set: { json: JSON.stringify(policy), updatedAt: now } })
    .run();
  exportEngineRules(policy);
  return policy;
}

/** Mirror blocklists to the file the capture engine watches, so blocked apps never reach the spool either. */
export function exportEngineRules(policy: Policy): string {
  ensureDataDir();
  const path = join(config.dataDir, "capture-rules.json");
  writeFileSync(
    path,
    JSON.stringify(
      {
        block_exe: policy.blockedApps.map((a) => a.toLowerCase()),
        block_domain: policy.blockedDomains.map((d) => d.toLowerCase().replace(/^\*\./, "")),
      },
      null,
      2,
    ),
  );
  return path;
}
