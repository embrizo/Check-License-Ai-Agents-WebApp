import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { orgSettings } from "@/db/schema";

export async function getOrgSettings(orgId: string) {
  const db = getDb();
  const [row] = await db.select().from(orgSettings).where(eq(orgSettings.organizationId, orgId));
  return row ?? null;
}

export async function upsertOrgSettings(orgId: string, input: Partial<{
  alertThresholds: number[];
  alertRecipients: string[];
  productFilterRegex: string | null;
  timezone: string;
  notifyCustomerContacts: boolean;
  aiEnabled: boolean;
  alertSendHour: number;
}>) {
  const db = getDb();

  // Drizzle rejects an empty `set` object ("No values to set") — an empty
  // input means "create the row with defaults if it doesn't exist yet"
  // (e.g. new-org bootstrap), which onConflictDoNothing expresses directly.
  if (Object.keys(input).length === 0) {
    const [existing] = await db.insert(orgSettings)
      .values({ organizationId: orgId })
      .onConflictDoNothing()
      .returning();
    return existing ?? await getOrgSettings(orgId);
  }

  const [row] = await db
    .insert(orgSettings)
    .values({ organizationId: orgId, ...input })
    .onConflictDoUpdate({ target: orgSettings.organizationId, set: input })
    .returning();
  return row;
}
