import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { licenseFiles } from "@/db/schema";
import { departmentCondition, type DepartmentScope } from "@/server/auth/departmentScope";

type ParseSource = (typeof licenseFiles.parseSource.enumValues)[number];

// `scope` required on reads (see customers.ts) — filters the denormalized
// licenseFiles.department_id.
export async function listLicenseFiles(orgId: string, scope: DepartmentScope, customerId?: string) {
  const db = getDb();
  return db.select().from(licenseFiles).where(and(
    eq(licenseFiles.organizationId, orgId),
    customerId ? eq(licenseFiles.customerId, customerId) : undefined,
    departmentCondition(licenseFiles.departmentId, scope),
  ));
}

export async function getLicenseFile(orgId: string, licenseFileId: string, scope: DepartmentScope) {
  const db = getDb();
  const [row] = await db.select().from(licenseFiles)
    .where(and(
      eq(licenseFiles.id, licenseFileId),
      eq(licenseFiles.organizationId, orgId),
      departmentCondition(licenseFiles.departmentId, scope),
    ));
  return row ?? null;
}

export async function setLicenseFileParseError(licenseFileId: string, parseError: string | null) {
  const db = getDb();
  await db.update(licenseFiles).set({ parseError }).where(eq(licenseFiles.id, licenseFileId));
}

export async function getLicenseFileByName(orgId: string, customerId: string, filename: string) {
  const db = getDb();
  const [row] = await db.select().from(licenseFiles).where(and(
    eq(licenseFiles.organizationId, orgId),
    eq(licenseFiles.customerId, customerId),
    eq(licenseFiles.filename, filename),
  ));
  return row ?? null;
}

export async function upsertLicenseFile(input: {
  organizationId: string;
  customerId: string;
  /** Inherited from the owning customer's department — keeps the denormalized column in step. */
  departmentId: string | null;
  filename: string;
  content: string;
  contentHash: string;
  sizeBytes: number;
  parseError: string | null;
  uploadedBy: string;
  /** Provenance of the stored content; defaults to the column default ("flexlm") when omitted. */
  parseSource?: ParseSource;
}) {
  const db = getDb();
  const existing = await getLicenseFileByName(input.organizationId, input.customerId, input.filename);

  if (existing) {
    const [row] = await db.update(licenseFiles)
      .set({
        content: input.content,
        contentHash: input.contentHash,
        sizeBytes: input.sizeBytes,
        departmentId: input.departmentId,
        parseError: input.parseError,
        uploadedBy: input.uploadedBy,
        uploadedAt: new Date(),
        ...(input.parseSource ? { parseSource: input.parseSource } : {}),
      })
      .where(eq(licenseFiles.id, existing.id))
      .returning();
    return { file: row, wasNew: false };
  }

  const [row] = await db.insert(licenseFiles).values(input).returning();
  return { file: row, wasNew: true };
}
