import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://brainlog.dev",
  output: "static",
  trailingSlash: "never",
  compressHTML: true,
  build: { format: "file", inlineStylesheets: "always" },
});
