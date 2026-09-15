#!/usr/bin/env node
/**
 * Build the Tauri updater manifest from the collected bundles.
 *   node tooling/release/latest-json.mjs v1.0.13 bundles [existing-latest.json] > latest.json
 * Each platform maps to the signed artifact plus the contents of its .sig file. The macOS
 * universal archive serves both Apple Silicon and Intel keys; a platform with no .sig is skipped.
 * When an existing manifest for the same version is given, its platforms are kept unless this
 * run rebuilt them, so per-platform reruns add to the release instead of replacing it.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const [tag, dir, existingPath] = process.argv.slice(2);
if (!tag || !dir) {
  console.error("usage: latest-json.mjs <tag> <bundles-dir>");
  process.exit(2);
}
const version = tag.replace(/^v/, "");
const base = `https://github.com/ShivankK26/Brainlogs/releases/download/${tag}`;
const files = readdirSync(dir);
const pick = (re) => files.find((f) => re.test(f) && !f.endsWith(".sig"));
const entry = (name) => {
  if (!name) return null;
  const sig = join(dir, `${name}.sig`);
  if (!existsSync(sig)) return null;
  return { url: `${base}/${encodeURIComponent(name)}`, signature: readFileSync(sig, "utf8").trim() };
};
const mac = entry(pick(/\.app\.tar\.gz$/));
const win = entry(pick(/-setup\.exe$/)) ?? entry(pick(/\.msi$/));
const linux = entry(pick(/\.AppImage$/));
const platforms = {};
if (existingPath && existsSync(existingPath)) {
  try {
    const prev = JSON.parse(readFileSync(existingPath, "utf8"));
    if (prev.version === version && prev.platforms) Object.assign(platforms, prev.platforms);
  } catch {
    /* unreadable previous manifest: start fresh */
  }
}
if (mac) Object.assign(platforms, { "darwin-universal": mac, "darwin-aarch64": mac, "darwin-x86_64": mac });
if (win) platforms["windows-x86_64"] = win;
if (linux) platforms["linux-x86_64"] = linux;
if (Object.keys(platforms).length === 0) {
  console.error("no signed updater artifacts found in", dir);
  process.exit(1);
}
const notes = (() => {
  try {
    const log = readFileSync("CHANGELOG.md", "utf8");
    const m = log.match(new RegExp(`## ${version.replace(/\./g, "\\.")}[^\n]*\n([\s\S]*?)(?=\n## |$)`));
    return m ? m[1].trim() : "";
  } catch {
    return "";
  }
})();
process.stdout.write(JSON.stringify({ version, notes, pub_date: new Date().toISOString(), platforms }, null, 2) + "\n");
