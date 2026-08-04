import "server-only";
import { eq, and, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { passwordSetupTokens } from "@/db/schema";
import { generateToken, hashToken } from "@/server/domain/tokens";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** Returns the raw token — caller embeds it in the set-password link. Never stored; only its hash is. */
export async function createSetupToken(userId: string): Promise<string> {
  const db = getDb();
  const { raw, hash } = generateToken();
  await db.insert(passwordSetupTokens).values({
    userId,
    tokenHash: hash,
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  });
  return raw;
}

/** Validates, single-use, 24h expiry (docs/04 §2). Returns the userId to set a password for, or null if invalid/expired/already used. */
export async function consumeSetupToken(rawToken: string): Promise<string | null> {
  const db = getDb();
  const hash = hashToken(rawToken);
  const [row] = await db.select().from(passwordSetupTokens).where(and(
    eq(passwordSetupTokens.tokenHash, hash),
    isNull(passwordSetupTokens.usedAt),
    gt(passwordSetupTokens.expiresAt, new Date()),
  ));
  if (!row) return null;

  await db.update(passwordSetupTokens).set({ usedAt: new Date() }).where(eq(passwordSetupTokens.id, row.id));
  return row.userId;
}
