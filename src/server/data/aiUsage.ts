import "server-only";
import { and, count, eq, gte } from "drizzle-orm";
import { getDb } from "@/db";
import { aiUsage } from "@/db/schema";

export async function countAiCallsThisMonth(orgId: string): Promise<number> {
  const db = getDb();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [row] = await db.select({ n: count() }).from(aiUsage)
    .where(and(eq(aiUsage.organizationId, orgId), gte(aiUsage.createdAt, startOfMonth)));
  return row?.n ?? 0;
}

export async function logAiUsage(input: {
  organizationId: string;
  userId: string | null;
  feature: "parse" | "ask" | "draft";
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  succeeded: boolean;
}) {
  const db = getDb();
  await db.insert(aiUsage).values(input);
}
