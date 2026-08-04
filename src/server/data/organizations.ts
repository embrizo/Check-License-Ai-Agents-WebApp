import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";

export async function getOrganization(orgId: string) {
  const db = getDb();
  const [row] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  return row ?? null;
}
