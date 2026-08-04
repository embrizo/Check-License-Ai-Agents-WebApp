import { differenceInCalendarDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";

/**
 * Pure, no I/O (D-rule: src/server/domain/* takes strings/objects, returns
 * objects — testable without a database). "Days remaining" is computed from
 * *today* in the org's timezone, never the server's — see docs/01
 * architecture D11. `expireDate` is a plain `YYYY-MM-DD` calendar day.
 */
export function daysRemaining(expireDate: string | null, timezone: string, now: Date = new Date()): number | null {
  if (!expireDate) return null;   // perpetual / unknown — never alerts
  const today = toZonedTime(now, timezone);
  const [y, m, d] = expireDate.split("-").map(Number);
  const expiry = new Date(y, m - 1, d);
  const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return differenceInCalendarDays(expiry, todayLocal);
}

/**
 * `<=` never `==` — D11's rule. A missed cron run must still catch the
 * license on the next run; `==` would skip it silently forever.
 */
export function crossesThreshold(remaining: number | null, thresholdDays: number): boolean {
  if (remaining === null) return false;
  return remaining <= thresholdDays;
}

export type ExpiryBucket = "expired" | "critical" | "warning" | "ok" | "perpetual";

export function bucketFor(remaining: number | null): ExpiryBucket {
  if (remaining === null) return "perpetual";
  if (remaining <= 0) return "expired";
  if (remaining <= 15) return "critical";
  if (remaining <= 30) return "warning";
  return "ok";
}
