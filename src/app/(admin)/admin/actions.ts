"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgAccess } from "@/server/auth/guards";
import { runDailyCheckTracked, type DailyCheckStats } from "@/server/jobs/dailyCheck";
import { createOrganization } from "@/server/data/admin/organizations";
import { recordAuditLog } from "@/server/data/admin/auditLog";
import { upsertOrgSettings } from "@/server/data/organizationSettings";
import { getDb } from "@/db";
import { subscriptions, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * The same logic behind the cron route, exposed to a human for testing
 * without waiting a day (docs/01 D7 "Manual trigger").
 */
export async function runCheckNowAction(): Promise<DailyCheckStats> {
  await requireOrgAccess({ role: "super_admin" });
  const stats = await runDailyCheckTracked("manual");
  revalidatePath("/admin");   // so the last-run panel reflects the run just made
  return stats;
}

const OrgInput = z.object({ name: z.string().trim().min(1).max(200) });

export type CreateOrgState = { error?: string } | undefined;

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "org";
}

export async function createOrganizationAction(_prevState: CreateOrgState, formData: FormData): Promise<CreateOrgState> {
  const { session } = await requireOrgAccess({ role: "super_admin" });

  const parsed = OrgInput.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: "Enter an organization name." };

  const db = getDb();
  let slug = slugify(parsed.data.name);
  const [existing] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug));
  if (existing) slug = `${slug}-${Date.now().toString(36)}`;

  const org = await createOrganization({ name: parsed.data.name, slug });

  // New orgs start on a 14-day trial — admin extends via the subscription
  // editor once terms are agreed (docs D6: admin-granted time windows).
  await db.insert(subscriptions).values({
    organizationId: org.id,
    plan: "trial",
    status: "trial",
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  });
  await upsertOrgSettings(org.id, {});

  await recordAuditLog({
    organizationId: org.id,
    userId: session.user.id,
    action: "organization.create",
    targetType: "organization",
    targetId: org.id,
    metadata: { name: org.name, slug: org.slug },
  });

  revalidatePath("/admin");
}
