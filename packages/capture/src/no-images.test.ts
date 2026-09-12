/** §14: nothing in the capture → ingest → purge → backup path ever writes an image to the data dir. */
import { cpSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { backupDb, config, migrate, purgeExpiredEvents } from "@brainlog/core";
import { ingestSpool } from "./ingest.js";

const here = dirname(fileURLToPath(import.meta.url));
const MAGIC: Array<[string, Buffer]> = [
  ["png", Buffer.from([0x89, 0x50, 0x4e, 0x47])],
  ["jpeg", Buffer.from([0xff, 0xd8, 0xff])],
  ["gif", Buffer.from("GIF8")],
  ["bmp", Buffer.from("BM")],
  ["webp", Buffer.from("RIFF")],
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

describe("no images on disk", () => {
  beforeAll(async () => {
    migrate();
    const spool = mkdtempSync(join(tmpdir(), "brainlog-spool-img-"));
    cpSync(join(here, "..", "fixtures", "spool"), spool, { recursive: true });
    await ingestSpool({ spoolDir: spool, platform: "win32" }); // the OCR platform
    purgeExpiredEvents(new Date("2027-01-01T00:00:00.000Z"));
    backupDb();
  });
  it("the data directory contains no image files by extension or magic bytes", () => {
    const files = walk(config.dataDir);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(f, `image extension: ${f}`).not.toMatch(/\.(png|jpe?g|gif|bmp|webp|tiff?|heic)$/i);
      const head = readFileSync(f).subarray(0, 8);
      for (const [name, magic] of MAGIC) expect(head.subarray(0, magic.length).equals(magic), `${name} magic in ${f}`).toBe(false);
    }
  });
});
