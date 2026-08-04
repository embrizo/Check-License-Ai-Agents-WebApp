import "server-only";
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
  CRON_SECRET: z.string().min(1, "CRON_SECRET is required"),
  // Present-but-empty (the checked-in .env.local default before a key is
  // issued) must pass too, not just absent — otherwise every unrelated
  // getEnv() call (e.g. login, which needs none of this) fails.
  RESEND_API_KEY: z.string().optional().transform((v) => (v ? v : undefined)),
  GEMINI_API_KEY: z.string().optional().transform((v) => (v ? v : undefined)),
  // Monitoring. Both optional so dev/preview stay silent, but production
  // without them has no way to report that the alerter stopped running.
  HEARTBEAT_URL: z.string().optional().transform((v) => (v ? v : undefined)),
  OPS_ALERT_EMAIL: z.string().optional().transform((v) => (v ? v : undefined)),
});

type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/**
 * Validated lazily, not at module load — so pages that don't touch the DB,
 * auth, or cron can still render (and `next build` can still run) before
 * every secret is configured. The first Server Action or Route Handler that
 * actually needs a var pays the validation cost, with a clear error instead
 * of a silent `undefined`.
 */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Missing/invalid environment variables: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  }
  cached = parsed.data;
  return cached;
}
