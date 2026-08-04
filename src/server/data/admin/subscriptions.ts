import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { subscriptions } from "@/db/schema";

/**
 * Cross-org by design — the daily cron has no session/orgId at all, so it
 * needs its own explicit "which orgs get scanned today" query rather than
 * the org-scoped data layer. Kept in data/admin/ alongside the other
 * cross-tenant reads so it's easy to find and audit (docs/03 §4).
 */
export async function listActiveOrgIds(): Promise<string[]> {
  const db = getDb();
  const rows = await db.select({ organizationId: subscriptions.organizationId })
    .from(subscriptions)
    .where(and(eq(subscriptions.status, "active"), gt(subscriptions.expiresAt, new Date())));
  return rows.map((r) => r.organizationId);
}
