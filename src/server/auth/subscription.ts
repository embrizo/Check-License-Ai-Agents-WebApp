import "server-only";
import { getActiveSubscription } from "@/server/data/subscriptions";
import type { SubscriptionReason } from "./errors";

export type Access =
  | { ok: true; subscription: NonNullable<Awaited<ReturnType<typeof getActiveSubscription>>> }
  | { ok: false; reason: SubscriptionReason };

export async function checkAccess(orgId: string): Promise<Access> {
  const sub = await getActiveSubscription(orgId);
  if (!sub) return { ok: false, reason: "none" };
  if (sub.status === "suspended") return { ok: false, reason: "suspended" };
  if (sub.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };
  return { ok: true, subscription: sub };
}
