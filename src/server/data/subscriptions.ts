import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { subscriptions } from "@/db/schema";

/** Most recent subscription row for the org — the one enforcement checks against. */
export async function getActiveSubscription(orgId: string) {
  const db = getDb();
  const [row] = await db.select().from(subscriptions)
    .where(eq(subscriptions.organizationId, orgId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Scoped to the single row `getActiveSubscription` would return, never to
 * `organizationId` alone. An org accumulates subscription rows over time (a
 * trial, then a paid plan), and only the newest is enforced — a write filtered
 * only by org would retroactively rewrite the expired trial's dates too,
 * destroying the billing history the older rows exist to record.
 */
export async function extendSubscription(orgId: string, newExpiresAt: Date) {
  const db = getDb();
  const current = await getActiveSubscription(orgId);
  if (!current) return null;

  const [row] = await db.update(subscriptions)
    .set({ expiresAt: newExpiresAt, updatedAt: new Date() })
    .where(eq(subscriptions.id, current.id))
    .returning();
  return row ?? null;
}

/** Same single-row scoping rule as extendSubscription — see its comment. */
export async function setSubscriptionStatus(
  orgId: string,
  status: "active" | "suspended" | "expired" | "trial",
) {
  const db = getDb();
  const current = await getActiveSubscription(orgId);
  if (!current) return null;

  const [row] = await db.update(subscriptions)
    .set({ status, updatedAt: new Date() })
    .where(eq(subscriptions.id, current.id))
    .returning();
  return row ?? null;
}
