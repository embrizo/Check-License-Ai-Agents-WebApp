import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { departments } from "@/db/schema";

export async function listDepartments(orgId: string) {
  const db = getDb();
  return db.select().from(departments)
    .where(eq(departments.organizationId, orgId))
    .orderBy(departments.name);
}

export async function getDepartment(orgId: string, departmentId: string) {
  const db = getDb();
  const [row] = await db.select().from(departments)
    .where(and(eq(departments.id, departmentId), eq(departments.organizationId, orgId)));
  return row ?? null;
}

/**
 * Returns null when the name is already taken in this org (`uq_department_org_name`)
 * rather than throwing — a duplicate name is ordinary user input. Mirrors
 * createCustomer's onConflictDoNothing pattern (which also closes the
 * check-then-insert race).
 */
export async function createDepartment(orgId: string, name: string) {
  const db = getDb();
  const [row] = await db.insert(departments)
    .values({ organizationId: orgId, name })
    .onConflictDoNothing({ target: [departments.organizationId, departments.name] })
    .returning();
  return row ?? null;
}

/** Set a department's alert recipient list (the addresses its licenses'/certs'
 *  expiry emails go to). Tenant-scoped. Returns the updated row, or null. */
export async function setDepartmentRecipients(orgId: string, departmentId: string, recipients: string[]) {
  const db = getDb();
  const [row] = await db.update(departments)
    .set({ alertRecipients: recipients })
    .where(and(eq(departments.id, departmentId), eq(departments.organizationId, orgId)))
    .returning();
  return row ?? null;
}
