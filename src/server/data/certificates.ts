import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { certificates, certAlertLog, customers } from "@/db/schema";
import type { CertCategory } from "@/server/domain/certificates";

export interface CertificateInput {
  category: CertCategory;
  certType: string;
  holderName: string | null;
  certNumber: string | null;
  issueDate: string;   // YYYY-MM-DD
  expireDate: string;  // YYYY-MM-DD
  renewalMonths: number;
  notes: string | null;
  customerId: string | null;
}

/** Small org-sized datasets (D12) — filter/sort in the page, not here. */
export async function listCertificatesWithCustomer(orgId: string) {
  const db = getDb();
  const rows = await db.select({
    cert: certificates,
    customerName: customers.name,
  }).from(certificates)
    .leftJoin(customers, eq(certificates.customerId, customers.id))
    .where(eq(certificates.organizationId, orgId));
  return rows.map((r) => ({ ...r.cert, customerName: r.customerName }));
}

export async function getCertificate(orgId: string, certId: string) {
  const db = getDb();
  const [row] = await db.select().from(certificates)
    .where(and(eq(certificates.id, certId), eq(certificates.organizationId, orgId)));
  return row ?? null;   // wrong tenant → null, indistinguishable from not-found
}

export async function createCertificate(
  orgId: string,
  createdBy: string,
  input: CertificateInput,
) {
  const db = getDb();
  const [row] = await db.insert(certificates).values({
    organizationId: orgId,
    customerId: input.customerId,
    category: input.category,
    certType: input.certType,
    holderName: input.holderName,
    certNumber: input.certNumber,
    issueDate: input.issueDate,
    expireDate: input.expireDate,
    renewalMonths: input.renewalMonths,
    notes: input.notes,
    createdBy,
  }).returning();
  return row;
}

/**
 * Tenant-scoped update: the orgId is in the WHERE, so a certId from another org
 * matches zero rows and returns null rather than editing someone else's record.
 */
export async function updateCertificate(
  orgId: string,
  certId: string,
  input: CertificateInput,
) {
  const db = getDb();
  const [row] = await db.update(certificates)
    .set({
      customerId: input.customerId,
      category: input.category,
      certType: input.certType,
      holderName: input.holderName,
      certNumber: input.certNumber,
      issueDate: input.issueDate,
      expireDate: input.expireDate,
      renewalMonths: input.renewalMonths,
      notes: input.notes,
      updatedAt: new Date(),
    })
    .where(and(eq(certificates.id, certId), eq(certificates.organizationId, orgId)))
    .returning();
  return row ?? null;
}

export async function deleteCertificate(orgId: string, certId: string) {
  const db = getDb();
  const [row] = await db.delete(certificates)
    .where(and(eq(certificates.id, certId), eq(certificates.organizationId, orgId)))
    .returning({ id: certificates.id });
  return !!row;
}

/* ---------- alerting (parallel to data/alertLog.ts) ---------- */

/**
 * Every cert is an alert candidate: `expire_date` is NOT NULL and there's no
 * review/perpetual state to exclude (unlike licenses). Joined to the optional
 * customer name for the email.
 */
export async function listCertAlertCandidates(orgId: string) {
  const db = getDb();
  const rows = await db.select({
    cert: certificates,
    customerName: customers.name,
  }).from(certificates)
    .leftJoin(customers, eq(certificates.customerId, customers.id))
    .where(eq(certificates.organizationId, orgId));
  return rows.map((r) => ({ ...r.cert, customerName: r.customerName }));
}

/** Backs the `uq_cert_alert_dedup` constraint check — same contract as licenses. */
export async function hasCertAlertBeenSent(certificateId: string, thresholdDays: number, expireDate: string) {
  const db = getDb();
  const [row] = await db.select({ id: certAlertLog.id }).from(certAlertLog).where(and(
    eq(certAlertLog.certificateId, certificateId),
    eq(certAlertLog.thresholdDays, thresholdDays),
    eq(certAlertLog.expireDate, expireDate),
  ));
  return !!row;
}

export async function recordCertAlert(input: {
  organizationId: string;
  certificateId: string;
  thresholdDays: number;
  expireDate: string;
  recipients: string[];
  providerMessageId: string | null;
}) {
  const db = getDb();
  await db.insert(certAlertLog).values({
    organizationId: input.organizationId,
    certificateId: input.certificateId,
    thresholdDays: input.thresholdDays,
    expireDate: input.expireDate,
    recipients: input.recipients.join(","),
    providerMessageId: input.providerMessageId,
  });
}
