import { defineConfig } from "drizzle-kit";

// drizzle-kit auto-loads .env.local (and .env) itself — no dotenv wiring needed here.

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
