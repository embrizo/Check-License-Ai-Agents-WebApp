import "server-only";
import { and, count, eq, notExists } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, licenses } from "@/db/schema";

export async function listCustomers(orgId: string) {
  const db = getDb();
  return db.select().from(customers).where(eq(customers.organizationId, orgId));
}

export async function listCustomersWithLicenseCounts(orgId: string) {
  const db = getDb();
  const rows = await db.select({
    customer: customers,
    licenseCount: count(licenses.id),
  }).from(customers)
    .leftJoin(licenses, eq(licenses.customerId, customers.id))
    .where(eq(customers.organizationId, orgId))
    .groupBy(customers.id);
  return rows.map((r) => ({ ...r.customer, licenseCount: r.licenseCount }));
}

export async function getCustomer(orgId: string, customerId: string) {
  const db = getDb();
  const [row] = await db.select().from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.organizationId, orgId)));
  return row ?? null;
}

/**
 * Returns null when the name is already taken in this org (`uq_customer_org_name`)
 * rather than throwing — a duplicate name is ordinary user input, not an
 * exceptional condition, and every caller is written to surface it as a form
 * message. `onConflictDoNothing` also closes the check-then-insert race that a
 * pre-flight SELECT would leave open.
 */
export async function createCustomer(orgId: string, name: string) {
  const db = getDb();
  const [row] = await db.insert(customers)
    .values({ organizationId: orgId, name })
    .onConflictDoNothing({ target: [customers.organizationId, customers.name] })
    .returning();
  return row ?? null;
}

/** How many licenses a customer still has — used to block its deletion and name the count. */
export async function countCustomerLicenses(orgId: string, customerId: string) {
  const db = getDb();
  const [row] = await db.select({ n: count() }).from(licenses)
    .where(and(eq(licenses.customerId, customerId), eq(licenses.organizationId, orgId)));
  return row?.n ?? 0;
}

/**
 * Deletes a customer ONLY if it has no licenses. Uploaded files and contacts
 * cascade away with it — they're re-uploadable source text / cheap, unlike
 * licenses and the alert history hanging off them. The `notExists` guard is in
 * the WHERE so the check-and-delete is atomic: a license created in the gap
 * between a caller's count and this call can't be silently cascade-wiped (the
 * delete just affects zero rows). Scoped by `(customerId, organizationId)` to
 * match countCustomerLicenses exactly, so the "has licenses?" answer can never
 * differ between the pre-check and this delete. Returns the deleted row, or
 * null if it still had a license / wasn't this org's.
 */
export async function deleteCustomerIfNoLicenses(orgId: string, customerId: string) {
  const db = getDb();
  const [row] = await db.delete(customers)
    .where(and(
      eq(customers.id, customerId),
      eq(customers.organizationId, orgId),
      notExists(db.select({ one: licenses.id }).from(licenses)
        .where(and(eq(licenses.customerId, customerId), eq(licenses.organizationId, orgId)))),
    ))
    .returning({ id: customers.id });
  return row ?? null;
}
