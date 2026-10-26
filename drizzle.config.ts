import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// drizzle-kit does NOT read .env.local on its own, so load it here before the
// config reads process.env.DATABASE_URL. dotenv also strips surrounding quotes
// if the value was pasted as DATABASE_URL="postgresql://…". The app runtime has
// its own env loading (src/lib/env.ts); this is only for the drizzle-kit CLI.
config({ path: ".env.local" });

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
