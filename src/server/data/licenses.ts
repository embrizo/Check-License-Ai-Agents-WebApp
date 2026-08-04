import "server-only";
import { and, eq, isNotNull, notInArray } from "drizzle-orm";
import { getDb } from "@/db";
import { licenses, customers } from "@/db/schema";
import type { ParsedLicense } from "@/server/domain/parsers/flexlm";
import type { AiParsedLicense } from "@/server/ai/gemini";

export async function listLicenses(orgId: string) {
  const db = getDb();
  return db.select().from(licenses).where(eq(licenses.organizationId, orgId));
}

export async function getLicense(orgId: string, licenseId: string) {
  const db = getDb();
  const [row] = await db.select().from(licenses)
    .where(and(eq(licenses.id, licenseId), eq(licenses.organizationId, orgId)));
  return row ?? null;   // wrong tenant → null, indistinguishable from not-found
}

export async function getLicenseWithCustomer(orgId: string, licenseId: string) {
  const db = getDb();
  const [row] = await db.select({ license: licenses, customerName: customers.name })
    .from(licenses)
    .innerJoin(customers, eq(licenses.customerId, customers.id))
    .where(and(eq(licenses.id, licenseId), eq(licenses.organizationId, orgId)));
  return row ? { ...row.license, customerName: row.customerName } : null;
}

/** Small org-sized datasets (D12) — filter/sort in the page, not here. */
export async function listLicensesWithCustomer(orgId: string) {
  const db = getDb();
  const rows = await db.select({
    license: licenses,
    customerName: customers.name,
  }).from(licenses)
    .innerJoin(customers, eq(licenses.customerId, customers.id))
    .where(eq(licenses.organizationId, orgId));
  return rows.map((r) => ({ ...r.license, customerName: r.customerName }));
}

/**
 * Licenses eligible for the daily alert run: a real expiry date, and
 * `confirmed` (never an unreviewed AI guess — docs/05 rule 2).
 */
export async function listAlertCandidates(orgId: string) {
  const db = getDb();
  const rows = await db.select({
    license: licenses,
    customerName: customers.name,
  }).from(licenses)
    .innerJoin(customers, eq(licenses.customerId, customers.id))
    .where(and(
      eq(licenses.organizationId, orgId),
      isNotNull(licenses.expireDate),
      eq(licenses.reviewState, "confirmed"),
    ));
  return rows.map((r) => ({ ...r.license, customerName: r.customerName }));
}

export async function listLicensesByCustomer(orgId: string, customerId: string) {
  const db = getDb();
  return db.select().from(licenses)
    .where(and(eq(licenses.organizationId, orgId), eq(licenses.customerId, customerId)));
}

/**
 * Upsert every license parsed from one file, then delete any row previously
 * attributed to that file whose product no longer appears in it — the
 * stale-row reconciliation carried over from the desktop app's scan.py.
 * Without this, a product removed from a license file keeps generating
 * alerts forever (docs/01 §3.1).
 */
export async function upsertLicensesForFile(input: {
  organizationId: string;
  customerId: string;
  licenseFileId: string;
  parsed: ParsedLicense[];
}) {
  const db = getDb();
  const { organizationId, customerId, licenseFileId, parsed } = input;

  for (const lic of parsed) {
    await db.insert(licenses).values({
      organizationId,
      customerId,
      licenseFileId,
      productName: lic.productName,
      vendor: lic.vendor,
      licenseKey: lic.licenseKey,
      soldTo: lic.soldTo,
      version: lic.version,
      expireDate: lic.expireDate,
      seats: lic.seats,
      status: lic.status,
      lastScannedAt: new Date(),
    }).onConflictDoUpdate({
      target: [licenses.licenseFileId, licenses.productName],
      set: {
        vendor: lic.vendor,
        licenseKey: lic.licenseKey,
        soldTo: lic.soldTo,
        version: lic.version,
        expireDate: lic.expireDate,
        seats: lic.seats,
        status: lic.status,
        lastScannedAt: new Date(),
      },
    });
  }

  const parsedProductNames = parsed.map((l) => l.productName);
  const deleted = await db.delete(licenses)
    .where(and(
      eq(licenses.licenseFileId, licenseFileId),
      parsedProductNames.length > 0
        ? notInArray(licenses.productName, parsedProductNames)
        : undefined,
    ))
    .returning({ id: licenses.id, productName: licenses.productName });

  return { upserted: parsed.length, staleDeleted: deleted };
}

/**
 * AI-parsed rows always land `pending_review` (docs/05 rule 2) — they must
 * never trigger an alert until a human confirms them. No stale-row deletion
 * here: unlike the deterministic parser, a partial/uncertain AI pass isn't
 * grounds to delete a row a previous pass already produced.
 *
 * `setWhere` is load-bearing: a human's Confirm is the only thing that makes a
 * row alert-eligible, so re-running AI parse must never overwrite a row that
 * already carries one. Without it, a second AI pass silently reverts confirmed
 * rows to `pending_review`, dropping them out of `listAlertCandidates` — the
 * exact silent-missed-expiry failure the review state exists to prevent.
 * Already-confirmed rows are left entirely alone (data included, since the
 * human reviewed *that* data); only still-pending rows get refreshed.
 */
export async function upsertAiLicensesForFile(input: {
  organizationId: string;
  customerId: string;
  licenseFileId: string;
  parsed: AiParsedLicense[];
}) {
  const db = getDb();
  const { organizationId, customerId, licenseFileId, parsed } = input;

  let upserted = 0;

  for (const lic of parsed) {
    const written = await db.insert(licenses).values({
      organizationId,
      customerId,
      licenseFileId,
      productName: lic.productName,
      vendor: lic.vendor ?? null,
      licenseKey: lic.licenseKey ?? null,
      version: lic.version ?? null,
      expireDate: lic.expireDate ?? null,
      seats: lic.seats ?? null,
      status: lic.status,
      reviewState: "pending_review",
      confidence: lic.confidence,
      lastScannedAt: new Date(),
    }).onConflictDoUpdate({
      target: [licenses.licenseFileId, licenses.productName],
      setWhere: eq(licenses.reviewState, "pending_review"),
      set: {
        vendor: lic.vendor ?? null,
        licenseKey: lic.licenseKey ?? null,
        version: lic.version ?? null,
        expireDate: lic.expireDate ?? null,
        seats: lic.seats ?? null,
        status: lic.status,
        reviewState: "pending_review",
        confidence: lic.confidence,
        lastScannedAt: new Date(),
      },
    }).returning({ id: licenses.id });

    if (written.length > 0) upserted++;
  }

  // `skippedConfirmed` is surfaced to the user rather than hidden — "AI found
  // 5, 2 already confirmed" is honest; reporting 5 upserts would not be.
  return { upserted, skippedConfirmed: parsed.length - upserted };
}

export async function confirmLicense(orgId: string, licenseId: string) {
  const db = getDb();
  await db.update(licenses).set({ reviewState: "confirmed" })
    .where(and(eq(licenses.id, licenseId), eq(licenses.organizationId, orgId)));
}

/** Scoped to pending_review so this can never delete a confirmed/manual row — only an unreviewed AI guess. */
export async function rejectAiLicense(orgId: string, licenseId: string) {
  const db = getDb();
  await db.delete(licenses)
    .where(and(eq(licenses.id, licenseId), eq(licenses.organizationId, orgId), eq(licenses.reviewState, "pending_review")));
}
