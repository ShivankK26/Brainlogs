import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/brainlog-schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
});
