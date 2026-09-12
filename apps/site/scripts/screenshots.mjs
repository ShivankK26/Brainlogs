// Refresh the product screenshot used by the landing page from the app's Playwright screens spec.
import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..", "..");
const app = join(root, "apps", "app");
spawnSync("pnpm", ["exec", "playwright", "test", "e2e/screens.spec.ts"], { cwd: app, stdio: "inherit" });
const src = join(app, "test-results", "memory.png");
if (!existsSync(src)) throw new Error("screenshot not produced");
// sharp ships transitively (via @xenova/transformers); resolve it from the pnpm store so this package stays dependency-free.
const store = join(root, "node_modules", ".pnpm");
const sharpDir = readdirSync(store).find((d) => d.startsWith("sharp@"));
if (!sharpDir) throw new Error("sharp not installed");
const sharp = createRequire(import.meta.url)(join(store, sharpDir, "node_modules", "sharp"));
const out = join(here, "..", "public", "app-memory.webp");
await sharp(src).resize({ width: 1080 }).webp({ quality: 82 }).toFile(out);
console.log(`updated ${out}`);
