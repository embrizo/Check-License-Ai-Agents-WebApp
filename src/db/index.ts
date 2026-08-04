import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

let cached: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Lazy singleton — constructed on first query, not at module load, so
 * importing this file (e.g. transitively through a Server Component) never
 * fails just because DATABASE_URL isn't set yet.
 */
export function getDb() {
  if (cached) return cached;
  const sql = neon(getEnv().DATABASE_URL);
  cached = drizzle(sql, { schema });
  return cached;
}
