import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog } from "@/db/schema";

export async function recordAuditLog(input: {
  organizationId: string | null;
  userId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}) {
  const db = getDb();
  await db.insert(auditLog).values(input);
}

export async function listAuditLogForOrg(orgId: string, limit = 100) {
  const db = getDb();
  return db.select().from(auditLog)
    .where(eq(auditLog.organizationId, orgId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
