/**
 * Stage everything the desktop shell needs to run the core without Node or a source checkout:
 *
 *   apps/desktop/src-tauri/binaries/brainlogs-node-<triple>   Node 22 runtime as a Tauri sidecar
 *   apps/desktop/src-tauri/bundle-res/core/worker.mjs         the worker, bundled with esbuild (ESM)
 *   apps/desktop/src-tauri/bundle-res/core/drizzle/           SQL migrations
 *   apps/desktop/src-tauri/bundle-res/core/node_modules/      native deps only: better-sqlite3 (+bindings), sqlite-vec
 *   apps/desktop/src-tauri/bundle-res/ui/                     the built React app
 *
 * Usage: node tooling/release/prepare-bundle.mjs [--targets aarch64-apple-darwin,x86_64-apple-darwin]
 * Defaults to the host platform's targets (both arches on macOS so the universal build works).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TAURI = join(ROOT, "apps", "desktop", "src-tauri");
const RES = join(TAURI, "bundle-res");
const CORE = join(RES, "core");
const BIN = join(TAURI, "binaries");
const NODE_VERSION = process.env.BRAINLOGS_NODE_VERSION ?? "22.20.0"; // ABI 127 — must match better-sqlite3's prebuilt
const NODE_ABI = "127";
const BSQ_VERSION = JSON.parse(readFileSync(join(ROOT, "node_modules/.pnpm").length ? findStorePkg("better-sqlite3") : "", "utf8")).version;
const VEC_VERSION = JSON.parse(readFileSync(findStorePkg("sqlite-vec"), "utf8")).version;

const TARGETS = {
  "aarch64-apple-darwin": { node: `node-v${NODE_VERSION}-darwin-arm64.tar.gz`, nodeBin: "bin/node", bsq: "darwin-x64".replace("x64", "arm64"), vec: "sqlite-vec-darwin-arm64", lib: "vec0.dylib" },
  "x86_64-apple-darwin": { node: `node-v${NODE_VERSION}-darwin-x64.tar.gz`, nodeBin: "bin/node", bsq: "darwin-x64", vec: "sqlite-vec-darwin-x64", lib: "vec0.dylib" },
  "x86_64-unknown-linux-gnu": { node: `node-v${NODE_VERSION}-linux-x64.tar.xz`, nodeBin: "bin/node", bsq: "linux-x64", vec: "sqlite-vec-linux-x64", lib: "vec0.so" },
  "x86_64-pc-windows-msvc": { node: `node-v${NODE_VERSION}-win-x64.zip`, nodeBin: "node.exe", bsq: "win32-x64", vec: "sqlite-vec-windows-x64", lib: "vec0.dll" },
};

function findStorePkg(name) {
  const store = join(ROOT, "node_modules", ".pnpm");
  const dir = readdirSync(store).find((d) => d.startsWith(`${name}@`));
  if (!dir) throw new Error(`${name} not in pnpm store; run pnpm install`);
  return join(store, dir, "node_modules", name, "package.json");
}

function defaultTargets() {
  if (process.platform === "darwin") return ["aarch64-apple-darwin", "x86_64-apple-darwin"];
  if (process.platform === "win32") return ["x86_64-pc-windows-msvc"];
  return ["x86_64-unknown-linux-gnu"];
}

const argTargets = process.argv.indexOf("--targets");
const targets = argTargets >= 0 ? process.argv[argTargets + 1].split(",") : defaultTargets();
const log = (m) => console.log(`[bundle] ${m}`);
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", ...opts });
const cache = process.env.BRAINLOGS_BUNDLE_CACHE ?? join(process.env.HOME ?? process.env.USERPROFILE ?? tmpdir(), ".brainlogs-bundle-cache");
mkdirSync(cache, { recursive: true });

function download(url, dest) {
  if (existsSync(dest)) return dest;
  log(`download ${url}`);
  sh("curl", ["-fsSL", "--retry", "3", "-o", dest, url]);
  return dest;
}

function extract(archive, into) {
  mkdirSync(into, { recursive: true });
  // bsdtar (macOS, Windows) and GNU tar both read .zip/.tar.gz/.tar.xz via -xf
  sh("tar", ["-xf", archive, "-C", into]);
}

function findFile(dir, name) {
  if (!existsSync(dir)) return null;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      const r = findFile(p, name);
      if (r) return r;
    } else if (e.name === name) return p;
  }
  return null;
}

// ---- 1. UI
const uiDist = join(ROOT, "apps", "app", "dist");
if (!existsSync(join(uiDist, "index.html"))) {
  log("building the app UI");
  sh("pnpm", ["--filter", "@brainlog/app", "build"], { cwd: ROOT, shell: process.platform === "win32" });
}
rmSync(RES, { recursive: true, force: true });
mkdirSync(CORE, { recursive: true });
cpSync(uiDist, join(RES, "ui"), { recursive: true });

// ---- 2. worker bundle (ESM so import.meta.url keeps working)
log("bundling the worker with esbuild");
const esbuild = join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
sh(
  esbuild,
  [
    join(ROOT, "packages", "worker", "src", "cli.ts"),
    "--bundle",
    "--platform=node",
    "--target=node22",
    "--format=esm",
    `--outfile=${join(CORE, "worker.mjs")}`,
    "--external:better-sqlite3",
    "--external:sqlite-vec",
    "--external:@xenova/transformers",
    "--external:sharp",
    "--external:onnxruntime-node",
    "--log-level=warning",
    "--banner:js=import { createRequire as __cr } from 'node:module'; import { fileURLToPath as __fu } from 'node:url'; import { dirname as __dn } from 'node:path'; const require = __cr(import.meta.url); const __filename = __fu(import.meta.url); const __dirname = __dn(__filename);",
  ],
  { shell: process.platform === "win32" },
);
cpSync(join(ROOT, "packages", "core", "drizzle"), join(CORE, "drizzle"), { recursive: true });
writeFileSync(join(CORE, "package.json"), JSON.stringify({ name: "brainlogs-core", private: true, type: "module", version: JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version }, null, 2));

// ---- 3. runtime node_modules: only the native deps and their tiny helpers
const nm = join(CORE, "node_modules");
mkdirSync(nm, { recursive: true });
for (const name of ["bindings", "file-uri-to-path", "sqlite-vec"]) {
  cpSync(dirname(findStorePkg(name)), join(nm, name), { recursive: true });
}
const bsqSrc = dirname(findStorePkg("better-sqlite3"));
const bsqDst = join(nm, "better-sqlite3");
mkdirSync(join(bsqDst, "build", "Release"), { recursive: true });
for (const f of ["package.json", "lib"]) cpSync(join(bsqSrc, f), join(bsqDst, f), { recursive: true });

// native artifacts per target
const nodeFiles = [];
const vecLibs = [];
const bsqLibs = [];
const nativeDir = join(CORE, "native");
mkdirSync(nativeDir, { recursive: true });
for (const t of targets) {
  const spec = TARGETS[t];
  if (!spec) throw new Error(`unknown target ${t}`);
  const work = join(cache, t);
  mkdirSync(work, { recursive: true });

  // Node runtime
  const nodeArchive = download(`https://nodejs.org/dist/v${NODE_VERSION}/${spec.node}`, join(cache, spec.node));
  const nodeDir = join(work, "node");
  if (!findFile(nodeDir, spec.nodeBin.split("/").pop())) extract(nodeArchive, nodeDir);
  const nodeBin = findFile(nodeDir, spec.nodeBin.split("/").pop());
  if (!nodeBin) throw new Error(`node binary not found for ${t}`);
  mkdirSync(BIN, { recursive: true });
  const sidecar = join(BIN, `brainlogs-node-${t}${t.includes("windows") ? ".exe" : ""}`);
  cpSync(nodeBin, sidecar);
  if (!t.includes("windows")) chmodSync(sidecar, 0o755);
  nodeFiles.push(sidecar);

  // better-sqlite3 prebuilt for this target
  const bsqName = `better-sqlite3-v${BSQ_VERSION}-node-v${NODE_ABI}-${spec.bsq}.tar.gz`;
  const bsqArchive = download(`https://github.com/WiseLibs/better-sqlite3/releases/download/v${BSQ_VERSION}/${bsqName}`, join(cache, bsqName));
  const bsqDir = join(work, "bsq");
  if (!findFile(bsqDir, "better_sqlite3.node")) extract(bsqArchive, bsqDir);
  bsqLibs.push(findFile(bsqDir, "better_sqlite3.node"));

  // sqlite-vec loadable extension for this target
  const vecName = `${spec.vec}-${VEC_VERSION}.tgz`;
  const vecArchive = download(`https://registry.npmjs.org/${spec.vec}/-/${vecName}`, join(cache, vecName));
  const vecDir = join(work, "vec");
  if (!findFile(vecDir, spec.lib)) extract(vecArchive, vecDir);
  vecLibs.push({ path: findFile(vecDir, spec.lib), pkg: spec.vec, lib: spec.lib, pkgDir: dirname(findFile(vecDir, "package.json")) });
}

// merge macOS arches into universal binaries so one resource tree serves the universal .app
const isMac = targets.every((t) => t.endsWith("apple-darwin"));
const outBsq = join(bsqDst, "build", "Release", "better_sqlite3.node");
if (isMac && bsqLibs.length > 1) sh("lipo", ["-create", ...bsqLibs, "-output", outBsq]);
else cpSync(bsqLibs[0], outBsq);
const lib = vecLibs[0].lib;
const outVec = join(nativeDir, lib);
if (isMac && vecLibs.length > 1) sh("lipo", ["-create", ...vecLibs.map((v) => v.path), "-output", outVec]);
else cpSync(vecLibs[0].path, outVec);
for (const v of vecLibs) {
  // sqlite-vec's load() requires sqlite-vec-<platform>-<arch>; give every target package the merged library
  const dst = join(nm, v.pkg);
  cpSync(v.pkgDir, dst, { recursive: true });
  cpSync(outVec, join(dst, v.lib));
}

const size = (p) => Math.round(readdirSync(p, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).reduce((n, e) => n + (statSafe(join(e.parentPath ?? e.path, e.name))), 0) / 1e6);
function statSafe(p) {
  try {
    return readFileSync(p).length;
  } catch {
    return 0;
  }
}
log(`done: targets=${targets.join(",")} core=${size(CORE)} MB ui=${size(join(RES, "ui"))} MB sidecars=${nodeFiles.length}`);
void renameSync;
