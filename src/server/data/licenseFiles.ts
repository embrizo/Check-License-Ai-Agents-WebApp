import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { licenseFiles } from "@/db/schema";

export async function listLicenseFiles(orgId: string, customerId?: string) {
  const db = getDb();
  const where = customerId
    ? and(eq(licenseFiles.organizationId, orgId), eq(licenseFiles.customerId, customerId))
    : eq(licenseFiles.organizationId, orgId);
  return db.select().from(licenseFiles).where(where);
}

export async function getLicenseFile(orgId: string, licenseFileId: string) {
  const db = getDb();
  const [row] = await db.select().from(licenseFiles)
    .where(and(eq(licenseFiles.id, licenseFileId), eq(licenseFiles.organizationId, orgId)));
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
  filename: string;
  content: string;
  contentHash: string;
  sizeBytes: number;
  parseError: string | null;
  uploadedBy: string;
}) {
  const db = getDb();
  const existing = await getLicenseFileByName(input.organizationId, input.customerId, input.filename);

  if (existing) {
    const [row] = await db.update(licenseFiles)
      .set({
        content: input.content,
        contentHash: input.contentHash,
        sizeBytes: input.sizeBytes,
        parseError: input.parseError,
        uploadedBy: input.uploadedBy,
        uploadedAt: new Date(),
      })
      .where(eq(licenseFiles.id, existing.id))
      .returning();
    return { file: row, wasNew: false };
  }

  const [row] = await db.insert(licenseFiles).values(input).returning();
  return { file: row, wasNew: true };
}
