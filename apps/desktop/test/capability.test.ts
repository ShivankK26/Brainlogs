import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "src-tauri", "src");
const read = (p: string) => readFileSync(p, "utf8");

/** Every `#[tauri::command]` the shell registers. */
function commandsInRust(): string[] {
  const main = read(join(src, "main.rs"));
  return [...main.matchAll(/#\[tauri::command\]\s*(?:pub\s+)?(?:async\s+)?fn\s+([a-z0-9_]+)/g)].map((m) => m[1]!);
}

/** Commands the custom capability permits from the core's http origin. */
function commandsAllowed(): string[] {
  const toml = read(join(here, "..", "src-tauri", "permissions", "widget.toml"));
  const body = toml.slice(toml.indexOf("commands.allow"));
  return [...body.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]!);
}

describe("desktop capability", () => {
  /**
   * The UI is served from the local core over http, and a remote origin may only invoke the
   * commands the capability names. A command missing here is not a smaller feature: it is a
   * feature that silently does nothing, which is how the recall strip shipped twice unable to
   * speak (1.2.0, 1.3.0).
   */
  it("allows every command the shell registers", () => {
    const missing = commandsInRust().filter((c) => !commandsAllowed().includes(c));
    expect(missing).toEqual([]);
  });

  it("allows nothing that does not exist", () => {
    const registered = commandsInRust();
    const stale = commandsAllowed().filter((c) => !registered.includes(c));
    expect(stale).toEqual([]);
  });
});
