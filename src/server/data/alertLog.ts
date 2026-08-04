import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { alertLog, licenses, customers } from "@/db/schema";

/** Backs the `uq_alert_dedup` constraint check — the correctness guarantee (docs/03 §5). */
export async function hasAlertBeenSent(licenseId: string, thresholdDays: number, expireDate: string) {
  const db = getDb();
  const [row] = await db.select({ id: alertLog.id }).from(alertLog).where(and(
    eq(alertLog.licenseId, licenseId),
    eq(alertLog.thresholdDays, thresholdDays),
    eq(alertLog.expireDate, expireDate),
  ));
  return !!row;
}

export async function recordAlert(input: {
  organizationId: string;
  licenseId: string;
  thresholdDays: number;
  expireDate: string;
  recipients: string[];
  providerMessageId: string | null;
}) {
  const db = getDb();
  await db.insert(alertLog).values({
    organizationId: input.organizationId,
    licenseId: input.licenseId,
    thresholdDays: input.thresholdDays,
    expireDate: input.expireDate,
    recipients: input.recipients.join(","),
    providerMessageId: input.providerMessageId,
  });
}

export async function listAlertsForOrg(orgId: string) {
  const db = getDb();
  const rows = await db.select({
    alert: alertLog,
    productName: licenses.productName,
    customerName: customers.name,
  }).from(alertLog)
    .innerJoin(licenses, eq(alertLog.licenseId, licenses.id))
    .innerJoin(customers, eq(licenses.customerId, customers.id))
    .where(eq(alertLog.organizationId, orgId))
    .orderBy(desc(alertLog.sentAt))
    .limit(200);
  return rows.map((r) => ({ ...r.alert, productName: r.productName, customerName: r.customerName }));
}
