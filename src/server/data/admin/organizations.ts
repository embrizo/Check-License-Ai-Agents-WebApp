import "server-only";
import { eq, count, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations, users, licenses, subscriptions } from "@/db/schema";

// super_admin-only cross-org reads live here, in a separate, explicitly
// named module, so they're easy to find and audit (docs/03 §4).

export async function listOrganizationsWithStats() {
  const db = getDb();
  const orgs = await db.select().from(organizations);

  return Promise.all(
    orgs.map(async (org) => {
      const [[userCount], [licenseCount], [sub]] = await Promise.all([
        db.select({ n: count() }).from(users).where(eq(users.organizationId, org.id)),
        db.select({ n: count() }).from(licenses).where(eq(licenses.organizationId, org.id)),
        // Same row `getActiveSubscription` enforces against. An unordered
        // limit(1) let Postgres return a stale row, so the console could show
        // "active" for an org whose users were locked out by a newer
        // suspended one — the two queries have to agree on which row counts.
        db.select().from(subscriptions)
          .where(eq(subscriptions.organizationId, org.id))
          .orderBy(desc(subscriptions.createdAt))
          .limit(1),
      ]);
      return {
        ...org,
        userCount: userCount?.n ?? 0,
        licenseCount: licenseCount?.n ?? 0,
        subscription: sub ?? null,
      };
    }),
  );
}

export async function createOrganization(input: { name: string; slug: string }) {
  const db = getDb();
  const [row] = await db.insert(organizations).values(input).returning();
  return row;
}
