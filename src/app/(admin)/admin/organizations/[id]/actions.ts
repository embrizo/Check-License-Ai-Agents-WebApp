"use server";

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { addMonths } from "date-fns";
import { revalidatePath } from "next/cache";
import { requireOrgAccess } from "@/server/auth/guards";
import { createUser, setUserActive, setUserRole } from "@/server/data/users";
import { createSetupToken } from "@/server/data/passwordSetupTokens";
import {
  extendSubscription, getActiveSubscription, setSubscriptionStatus,
} from "@/server/data/subscriptions";
import { isUniqueViolation } from "@/server/data/errors";
import { recordAuditLog } from "@/server/data/admin/auditLog";
import type { UserRole } from "@/db/schema";

const CreateUserInput = z.object({
  email: z.email(),
  name: z.string().trim().max(200).optional(),
  role: z.enum(["member", "org_admin", "super_admin"]),
});

export type CreateUserState = { error?: string; setupToken?: string } | undefined;

/**
 * Never emails a plaintext password (docs/04 §2 "Preferred"). The account
 * gets a random, never-revealed passwordHash — it's unusable until the new
 * user visits the returned setup link and picks their own password.
 */
export async function createUserAction(orgId: string, _prevState: CreateUserState, formData: FormData): Promise<CreateUserState> {
  const { session } = await requireOrgAccess({ role: "super_admin" });

  const parsed = CreateUserInput.safeParse({
    email: formData.get("email"),
    name: formData.get("name") || undefined,
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const lockedPasswordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 12);

  // `uq_users_email` is global, not per-org (one address = one login), so this
  // collides whenever the same person is added to a second tenant — common
  // enough that it has to be a form error, not an error boundary.
  let user;
  try {
    user = await createUser(orgId, {
      email: parsed.data.email,
      name: parsed.data.name,
      role: parsed.data.role,
      passwordHash: lockedPasswordHash,
    });
  } catch (err) {
    if (isUniqueViolation(err, "uq_users_email")) {
      return { error: "That email address already has an account. Each address can belong to one organization." };
    }
    throw err;
  }

  const token = await createSetupToken(user.id);

  await recordAuditLog({
    organizationId: orgId,
    userId: session.user.id,
    action: "user.create",
    targetType: "user",
    targetId: user.id,
    metadata: { email: user.email, role: user.role },
  });

  revalidatePath(`/admin/organizations/${orgId}`);
  return { setupToken: token };
}

export async function toggleUserActiveAction(orgId: string, userId: string, isActive: boolean) {
  const { session } = await requireOrgAccess({ role: "super_admin" });
  await setUserActive(orgId, userId, isActive);
  await recordAuditLog({
    organizationId: orgId,
    userId: session.user.id,
    action: isActive ? "user.reactivate" : "user.deactivate",
    targetType: "user",
    targetId: userId,
  });
  revalidatePath(`/admin/organizations/${orgId}`);
}

export async function changeUserRoleAction(orgId: string, userId: string, role: UserRole) {
  const { session } = await requireOrgAccess({ role: "super_admin" });
  await setUserRole(orgId, userId, role);
  await recordAuditLog({
    organizationId: orgId,
    userId: session.user.id,
    action: "user.role_change",
    targetType: "user",
    targetId: userId,
    metadata: { role },
  });
  revalidatePath(`/admin/organizations/${orgId}`);
}

/**
 * Extends from the current `expiresAt`, not from today — a one-click extend
 * from "today" would silently gift away the unused remainder of the
 * current window (docs/04 §5).
 *
 * `addMonths` clamps to the end of the target month; raw `Date.setMonth`
 * overflows instead (Aug 31 + 6 months lands on Mar 3, not Feb 28), which
 * would quietly hand out extra days and log the wrong date as intentional.
 */
export async function extendSubscriptionAction(orgId: string, months: number) {
  const { session } = await requireOrgAccess({ role: "super_admin" });

  const current = await getActiveSubscription(orgId);
  const base = current && current.expiresAt.getTime() > Date.now() ? current.expiresAt : new Date();
  const next = addMonths(base, months);

  const updated = await extendSubscription(orgId, next);
  if (!updated) return { error: "This organization has no subscription to extend." };

  await recordAuditLog({
    organizationId: orgId,
    userId: session.user.id,
    action: "subscription.extend",
    targetType: "subscription",
    targetId: updated.id,
    metadata: { months, newExpiresAt: next.toISOString() },
  });
  revalidatePath(`/admin/organizations/${orgId}`);
  revalidatePath("/admin");
  return { ok: true as const };
}

export async function setSubscriptionStatusAction(orgId: string, status: "active" | "suspended" | "expired" | "trial") {
  const { session } = await requireOrgAccess({ role: "super_admin" });

  const updated = await setSubscriptionStatus(orgId, status);
  if (!updated) return { error: "This organization has no subscription to update." };

  await recordAuditLog({
    organizationId: orgId,
    userId: session.user.id,
    action: "subscription.status_change",
    targetType: "subscription",
    targetId: updated.id,
    metadata: { status },
  });
  revalidatePath(`/admin/organizations/${orgId}`);
  revalidatePath("/admin");
  return { ok: true as const };
}
