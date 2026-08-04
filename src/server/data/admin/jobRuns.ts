import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { jobRuns } from "@/db/schema";

// Cross-org by nature — a run spans every tenant — so it lives in data/admin/
// alongside the other cross-tenant queries (docs/03 §4).

export const DAILY_CHECK = "daily_check";

/**
 * Opens a run row *before* the work starts, with ok=false. If the process dies
 * mid-run the row survives as an unfinished failure, which is exactly what
 * should be reported; a row written only on success would leave a crash
 * indistinguishable from a cron that never fired.
 */
export async function startJobRun(job: string, trigger: "cron" | "manual") {
  const db = getDb();
  const [row] = await db.insert(jobRuns)
    .values({ job, trigger, startedAt: new Date() })
    .returning({ id: jobRuns.id });
  return row.id;
}

export async function finishJobRun(id: string, input: {
  ok: boolean;
  orgsProcessed: number;
  sent: number;
  skippedDuplicate: number;
  skippedPattern: number;
  errors: number;
  errorDetail: string | null;
}) {
  const db = getDb();
  await db.update(jobRuns)
    .set({ ...input, finishedAt: new Date() })
    .where(eq(jobRuns.id, id));
}

/** Most recent completed-or-not run, for the health check and the admin panel. */
export async function getLastJobRun(job: string = DAILY_CHECK) {
  const db = getDb();
  const [row] = await db.select().from(jobRuns)
    .where(eq(jobRuns.job, job))
    .orderBy(desc(jobRuns.startedAt))
    .limit(1);
  return row ?? null;
}

/** Recent history, so a pattern of intermittent failures is visible rather than just the latest state. */
export async function listRecentJobRuns(job: string = DAILY_CHECK, limit = 10) {
  const db = getDb();
  return db.select().from(jobRuns)
    .where(eq(jobRuns.job, job))
    .orderBy(desc(jobRuns.startedAt))
    .limit(limit);
}

/** Last run that actually completed — distinct from the last *attempt*. */
export async function getLastSuccessfulRun(job: string = DAILY_CHECK) {
  const db = getDb();
  const [row] = await db.select().from(jobRuns)
    .where(and(eq(jobRuns.job, job), eq(jobRuns.ok, true)))
    .orderBy(desc(jobRuns.startedAt))
    .limit(1);
  return row ?? null;
}
