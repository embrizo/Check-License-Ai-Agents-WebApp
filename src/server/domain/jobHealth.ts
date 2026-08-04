/**
 * Pure, no I/O — see ./thresholds.ts.
 *
 * Decides whether the daily alert run is healthy. The subtle case, and the
 * reason this exists at all, is `never`/`stale`: every other failure in this
 * app produces *something* to look at, but a cron that silently stops firing
 * produces nothing — no error, no log line, no row. Absence is the signal, so
 * it has to be computed from the clock rather than observed from an event.
 */

/** The job runs daily; 25h allows for a late run and DST without crying wolf. */
export const STALE_AFTER_HOURS = 25;

export type JobHealth = "ok" | "errors" | "stale" | "never" | "running";

export interface JobRunSummary {
  startedAt: Date;
  finishedAt: Date | null;
  ok: boolean;
  errors: number;
}

export function jobHealth(
  lastRun: JobRunSummary | null,
  now: Date = new Date(),
): JobHealth {
  if (!lastRun) return "never";

  const ageMs = now.getTime() - lastRun.startedAt.getTime();
  const staleMs = STALE_AFTER_HOURS * 60 * 60 * 1000;

  // An unfinished run is only "running" while it's plausibly still going; past
  // the staleness window it means the process died mid-run and never came
  // back, which is a failure, not activity.
  if (!lastRun.finishedAt) return ageMs > staleMs ? "stale" : "running";

  if (ageMs > staleMs) return "stale";
  if (!lastRun.ok || lastRun.errors > 0) return "errors";
  return "ok";
}

/** True when someone needs to look at it now. */
export function needsAttention(health: JobHealth): boolean {
  return health === "errors" || health === "stale" || health === "never";
}

export function describeHealth(health: JobHealth): string {
  switch (health) {
    case "ok":
      return "Alert checks are running normally.";
    case "errors":
      return "The last alert run reported errors — some expiry emails may not have been delivered.";
    case "stale":
      return `No completed alert run in over ${STALE_AFTER_HOURS} hours. Expiry emails are probably not going out — check the cron schedule.`;
    case "never":
      return "The alert check has never run. No expiry emails will be sent until it does.";
    case "running":
      return "An alert run is in progress.";
  }
}
