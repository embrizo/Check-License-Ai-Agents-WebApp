import "server-only";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import { users, type UserRole } from "@/db/schema";

export async function getUserByEmail(email: string) {
  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  return row ?? null;
}

export async function recordLogin(userId: string) {
  const db = getDb();
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
}

export async function listUsers(orgId: string) {
  const db = getDb();
  return db.select().from(users).where(eq(users.organizationId, orgId));
}

/** Self-service lookup — safe without org scoping because the id comes from the trusted session, never client input. */
export async function getUserById(userId: string) {
  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  return row ?? null;
}

export async function getUser(orgId: string, userId: string) {
  const db = getDb();
  const [row] = await db.select().from(users)
    .where(and(eq(users.id, userId), eq(users.organizationId, orgId)));
  return row ?? null;   // wrong tenant → null, indistinguishable from not-found
}

export async function createUser(orgId: string, input: {
  email: string; name?: string; role: UserRole; passwordHash: string;
}) {
  const db = getDb();
  const [row] = await db.insert(users).values({
    organizationId: orgId,
    email: input.email.toLowerCase(),
    name: input.name,
    role: input.role,
    passwordHash: input.passwordHash,
  }).returning();
  return row;
}

export async function setUserActive(orgId: string, userId: string, isActive: boolean) {
  const db = getDb();
  await db.update(users).set({ isActive })
    .where(and(eq(users.id, userId), eq(users.organizationId, orgId)));
}

export async function setUserRole(orgId: string, userId: string, role: UserRole) {
  const db = getDb();
  await db.update(users).set({ role })
    .where(and(eq(users.id, userId), eq(users.organizationId, orgId)));
}

/** Self-service only — scoped to the caller's own row, no orgId check (docs/04 §5a). */
export async function updateOwnProfile(userId: string, input: {
  name?: string;
  replyToEmail?: string | null;
}) {
  const db = getDb();
  await db.update(users).set(input).where(eq(users.id, userId));
}

export async function setPassword(userId: string, passwordHash: string) {
  const db = getDb();
  await db.update(users).set({ passwordHash, mustChangePassword: false }).where(eq(users.id, userId));
}
