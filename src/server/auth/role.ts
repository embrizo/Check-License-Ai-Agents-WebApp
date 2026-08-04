import type { UserRole } from "@/db/schema";

const RANK: Record<UserRole, number> = { member: 0, org_admin: 1, super_admin: 2 };

export function roleAtLeast(actual: UserRole, min: UserRole): boolean {
  return RANK[actual] >= RANK[min];
}
