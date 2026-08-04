import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { runDailyCheckTracked } from "@/server/jobs/dailyCheck";

export const dynamic = "force-dynamic";

/**
 * Bearer-secret authenticated (docs/01 D7) — no session, no orgId. Vercel
 * Cron hits this once a day; running it twice must produce no duplicate
 * emails, which is guaranteed by the `uq_alert_dedup` constraint, not by
 * anything in this handler.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${getEnv().CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Tracked: writes a job_runs row and pings the heartbeat, so a run that
  // stops happening is detectable from outside. The JSON response is a
  // convenience for whoever curls this — never the system of record.
  const stats = await runDailyCheckTracked("cron");
  return NextResponse.json(stats);
}
