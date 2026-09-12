/**
 * Developer ID signing + notarization for the .app / .dmg produced by `tauri build`.
 * Requires: APPLE_SIGNING_IDENTITY ("Developer ID Application: …"), APPLE_ID, APPLE_PASSWORD
 * (app-specific password), APPLE_TEAM_ID. No-op with a warning when they are missing so local
 * builds still work (they get the ad-hoc signature from sign-macos.mjs instead).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") process.exit(0);
const { APPLE_SIGNING_IDENTITY, APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID } = process.env;
if (!APPLE_SIGNING_IDENTITY || !APPLE_ID || !APPLE_PASSWORD || !APPLE_TEAM_ID) {
  console.warn("[notarize] Apple credentials not set — skipping Developer ID signing and notarization");
  process.exit(0);
}
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const bundle = join(ROOT, "apps", "desktop", "src-tauri", "target", "release", "bundle");
const apps = existsSync(join(bundle, "macos")) ? readdirSync(join(bundle, "macos")).filter((n) => n.endsWith(".app")) : [];
const dmgs = existsSync(join(bundle, "dmg")) ? readdirSync(join(bundle, "dmg")).filter((n) => n.endsWith(".dmg")) : [];
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit" });
for (const app of apps) {
  const p = join(bundle, "macos", app);
  sh("codesign", ["--force", "--deep", "--options", "runtime", "--timestamp", "--sign", APPLE_SIGNING_IDENTITY, p]);
  sh("codesign", ["--verify", "--deep", "--strict", "--verbose=2", p]);
}
for (const dmg of dmgs) {
  const p = join(bundle, "dmg", dmg);
  sh("codesign", ["--force", "--timestamp", "--sign", APPLE_SIGNING_IDENTITY, p]);
  sh("xcrun", ["notarytool", "submit", p, "--apple-id", APPLE_ID, "--password", APPLE_PASSWORD, "--team-id", APPLE_TEAM_ID, "--wait"]);
  sh("xcrun", ["stapler", "staple", p]);
}
console.log(`[notarize] signed ${apps.length} app(s), notarized ${dmgs.length} dmg(s)`);
