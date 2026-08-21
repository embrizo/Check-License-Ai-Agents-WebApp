import "server-only";
import { and, gt, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { subscriptions } from "@/db/schema";

/**
 * Cross-org by design — the daily cron has no session/orgId at all, so it
 * needs its own explicit "which orgs get scanned today" query rather than
 * the org-scoped data layer. Kept in data/admin/ alongside the other
 * cross-tenant reads so it's easy to find and audit (docs/03 §4).
 *
 * Must stay aligned with checkAccess() (server/auth/subscription.ts): an org
 * that can use the app is an org that should get alerts. That means `trial` as
 * well as `active` — a new tenant starts on a 14-day trial (see the admin
 * create-org action), keeps full write access the whole time, and would
 * otherwise silently receive no expiry alerts during exactly the window it's
 * evaluating the product. `suspended` and `expired`, and anything past its
 * expiry date, are excluded — same as checkAccess denies them.
 *
 * `distinct` because an org accumulates subscription rows over time (a trial,
 * then a paid plan); two qualifying rows must not process the org twice.
 */
export async function listActiveOrgIds(): Promise<string[]> {
  const db = getDb();
  const rows = await db.selectDistinct({ organizationId: subscriptions.organizationId })
    .from(subscriptions)
    .where(and(
      inArray(subscriptions.status, ["active", "trial"]),
      gt(subscriptions.expiresAt, new Date()),
    ));
  return rows.map((r) => r.organizationId);
}
