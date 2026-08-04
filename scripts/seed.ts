/**
 * One-time local bootstrap: an organization, a super_admin, an org_admin,
 * and an active subscription. There is no self-signup (docs/04) — this is
 * how the very first accounts get in. Run once against a fresh database:
 *
 *   npm run db:seed
 *
 * Note: super_admin always gets orgId: null from requireOrgAccess() (docs/04
 * §4) — it operates through /admin, not the org-scoped pages. Use the
 * org_admin login to exercise /uploads, /licenses, /customers, etc.
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });
config(); // fall back to .env for anything not in .env.local
import { drizzle } from "drizzle-orm/neon-http";
import bcrypt from "bcryptjs";
import * as schema from "../src/db/schema";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  const db = drizzle(neon(databaseUrl), { schema });

  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

  const [org] = await db.insert(schema.organizations)
    .values({ name: "Demo Organization", slug: "demo" })
    .returning();

  const passwordHash = await bcrypt.hash(password, 12);
  const [admin] = await db.insert(schema.users)
    .values({
      organizationId: org.id,
      email,
      name: "Super Admin",
      passwordHash,
      role: "super_admin",
      mustChangePassword: false,
    })
    .returning();

  const orgAdminEmail = process.env.SEED_ORG_ADMIN_EMAIL ?? "orgadmin@example.com";
  const orgAdminPassword = process.env.SEED_ORG_ADMIN_PASSWORD ?? "ChangeMe123!";
  const orgAdminHash = await bcrypt.hash(orgAdminPassword, 12);
  const [orgAdmin] = await db.insert(schema.users)
    .values({
      organizationId: org.id,
      email: orgAdminEmail,
      name: "Org Admin",
      passwordHash: orgAdminHash,
      role: "org_admin",
      mustChangePassword: false,
    })
    .returning();

  await db.insert(schema.subscriptions).values({
    organizationId: org.id,
    plan: "standard",
    status: "active",
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  });

  await db.insert(schema.orgSettings).values({ organizationId: org.id });

  console.log("Seeded:");
  console.log(`  Organization:   ${org.name} (${org.id})`);
  console.log(`  Super admin:    ${admin.email} / ${password}`);
  console.log(`  Org admin:      ${orgAdmin.email} / ${orgAdminPassword}`);
  console.log("  Subscription:   active, expires in 1 year");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
