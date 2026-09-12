import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Same rule as @brainlog/core's config (ADR 0004), duplicated so the UI has no node dependency. */
function dataDir(): string {
  if (process.env.BRAIN_DATA_DIR) return process.env.BRAIN_DATA_DIR;
  if (process.platform === "win32") return join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "brainlog");
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "brainlog");
  return join(homedir(), ".local", "share", "brainlog");
}

function devToken(): string | null {
  const p = join(dataDir(), "api-token");
  return existsSync(p) ? readFileSync(p, "utf8").trim() : null;
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET ?? "http://127.0.0.1:3000",
        changeOrigin: true,
        // Dev only: the worker sets an auth cookie when it serves index.html itself; the Vite origin never gets it.
        headers: devToken() ? { Authorization: `Bearer ${devToken()}` } : {},
      },
    },
  },
  build: { outDir: "dist", emptyOutDir: true, target: "es2022" },
});
