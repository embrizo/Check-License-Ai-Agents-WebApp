/**
 * Production bootstrap: exactly one super_admin, no demo org, no demo data.
 * Real orgs are created afterward through /admin (Phase 4), not by this script.
 *
 * Usage (DATABASE_URL must point at the prod branch, not dev):
 *   DATABASE_URL="postgresql://...prod..." SEED_ADMIN_EMAIL="you@example.com" npx tsx scripts/seed-prod.ts
 *
 * SEED_ADMIN_PASSWORD is optional — omit it and a random one-time password is
 * generated and printed once. mustChangePassword is always true, so whatever
 * password is used here only has to work for a single login.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import crypto from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as schema from "../src/db/schema";

function randomPassword(): string {
  return crypto.randomBytes(18).toString("base64url");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  const email = process.env.SEED_ADMIN_EMAIL;
  if (!email) throw new Error("SEED_ADMIN_EMAIL is not set");

  const generatedPassword = process.env.SEED_ADMIN_PASSWORD ? null : randomPassword();
  const password = process.env.SEED_ADMIN_PASSWORD ?? generatedPassword!;

  const db = drizzle(neon(databaseUrl), { schema });

  const [existing] = await db.select({ id: schema.users.id })
    .from(schema.users).where(eq(schema.users.email, email));
  if (existing) throw new Error(`A user with email ${email} already exists — refusing to overwrite.`);

  const passwordHash = await bcrypt.hash(password, 12);
  const [admin] = await db.insert(schema.users)
    .values({
      organizationId: null,
      email,
      name: "Super Admin",
      passwordHash,
      role: "super_admin",
      mustChangePassword: true,
    })
    .returning();

  console.log("Created production super_admin:");
  console.log(`  Email:    ${admin.email}`);
  if (generatedPassword) {
    console.log(`  Password: ${generatedPassword}  (one-time — you'll be forced to change it on first login)`);
  } else {
    console.log("  Password: (the one you set via SEED_ADMIN_PASSWORD)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
