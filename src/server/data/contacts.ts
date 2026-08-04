import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contacts, customers } from "@/db/schema";

// Contacts hang off customers, not organizations directly, but D4 still
// applies: every function takes orgId first and puts it in the WHERE clause
// via a join through customers, rather than trusting the caller already
// checked that customerId belongs to this org.

/** Every contact across every customer in the org, for the daily alert run to group by customerId in memory (D12 — org-sized datasets, no need for a per-customer round trip). */
export async function listContactsByOrg(orgId: string) {
  const db = getDb();
  const rows = await db.select({ contact: contacts }).from(contacts)
    .innerJoin(customers, eq(contacts.customerId, customers.id))
    .where(eq(customers.organizationId, orgId));
  return rows.map((r) => r.contact);
}

export async function listContacts(orgId: string, customerId: string) {
  const db = getDb();
  return db.select({ contact: contacts }).from(contacts)
    .innerJoin(customers, eq(contacts.customerId, customers.id))
    .where(and(eq(contacts.customerId, customerId), eq(customers.organizationId, orgId)))
    .then((rows) => rows.map((r) => r.contact));
}

export async function createContact(
  orgId: string,
  customerId: string,
  input: { email: string; name?: string; notify?: boolean },
) {
  const db = getDb();
  const [owned] = await db.select().from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.organizationId, orgId)));
  if (!owned) return null;

  const [row] = await db.insert(contacts).values({ customerId, ...input }).returning();
  return row;
}

export async function deleteContact(orgId: string, contactId: string) {
  const db = getDb();
  const [owned] = await db.select({ id: contacts.id }).from(contacts)
    .innerJoin(customers, eq(contacts.customerId, customers.id))
    .where(and(eq(contacts.id, contactId), eq(customers.organizationId, orgId)));
  if (!owned) return;

  await db.delete(contacts).where(eq(contacts.id, contactId));
}
