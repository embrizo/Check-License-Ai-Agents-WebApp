import "server-only";
import { and, count, eq } from "drizzle-orm";
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
