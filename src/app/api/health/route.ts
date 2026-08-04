import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { getLastJobRun } from "@/server/data/admin/jobRuns";
import { jobHealth, needsAttention, type JobHealth } from "@/server/domain/jobHealth";

export const dynamic = "force-dynamic";

/**
 * Liveness + alerter health, for an external uptime monitor (docs/06 Phase 7).
 *
 * Unauthenticated on purpose — a monitor can't hold a session — so it exposes
 * only booleans and a timestamp, never tenant data, org names or counts that
 * would leak customer information to anyone who curls it.
 *
 * Returns 503 when the database is unreachable OR the alert job is stale, so
 * a plain "is this URL healthy?" check catches a silently-dead cron too, not
 * just a hard outage. That is the whole point: the app failing loudly was
 * never the risk; the app going quiet was.
 */
export async function GET() {
  const checkedAt = new Date().toISOString();

  let dbUp = false;
  try {
    await getDb().execute(sql`select 1`);
    dbUp = true;
  } catch {
    return NextResponse.json(
      { status: "error", db: "down", alerts: "unknown", checkedAt },
      { status: 503 },
    );
  }

  // `never` deliberately reads as degraded on a fresh deployment: "the cron
  // has not fired yet" is exactly the state Phase 7 asks you to confirm out
  // of, and a green check before that has been proven is a lie.
  let alerts: JobHealth | "unknown";
  let lastRunAt: string | null = null;
  try {
    const lastRun = await getLastJobRun();
    lastRunAt = lastRun?.startedAt.toISOString() ?? null;
    alerts = jobHealth(lastRun);
  } catch {
    alerts = "unknown";
  }

  const degraded = alerts === "unknown" || needsAttention(alerts);

  return NextResponse.json(
    { status: degraded ? "degraded" : "ok", db: dbUp ? "up" : "down", alerts, lastRunAt, checkedAt },
    { status: degraded ? 503 : 200 },
  );
}
