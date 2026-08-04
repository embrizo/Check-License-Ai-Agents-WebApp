import { randomBytes, createHash } from "node:crypto";

/** Raw token goes in the link (never stored); only its hash is persisted — docs/04 §2. */
export function generateToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
