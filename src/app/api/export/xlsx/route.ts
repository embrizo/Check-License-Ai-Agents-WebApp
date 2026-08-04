import ExcelJS from "exceljs";
import { requireOrg } from "@/server/auth/guards";
import { listLicensesWithCustomer } from "@/server/data/licenses";
import { listAlertsForOrg } from "@/server/data/alertLog";
import { getOrgSettings } from "@/server/data/organizationSettings";
import { daysRemaining } from "@/server/domain/thresholds";
import { formatSeats } from "@/server/domain/seats";

export const dynamic = "force-dynamic";

// Port of engine/excel/writer.py's colour scheme — no atomic-save/tmp-file
// dance needed here, since D10 means this is built in memory and streamed,
// never written to disk.
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F81BD" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { color: { argb: "FFFFFFFF" }, bold: true };
const RED_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC7CE" } };
const AMBER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFEB9C" } };
const GREEN_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };

export async function GET() {
  const { orgId } = await requireOrg();

  const [settings, licenses, alerts] = await Promise.all([
    getOrgSettings(orgId),
    listLicensesWithCustomer(orgId),
    listAlertsForOrg(orgId),
  ]);
  const timezone = settings?.timezone ?? "Asia/Bangkok";

  const wb = new ExcelJS.Workbook();

  const wsLic = wb.addWorksheet("Licenses");
  wsLic.columns = [
    { header: "Customer", key: "customer", width: 24 },
    { header: "Sold-To/Install", key: "soldTo", width: 20 },
    { header: "Version", key: "version", width: 12 },
    { header: "Product", key: "product", width: 16 },
    { header: "Vendor", key: "vendor", width: 14 },
    { header: "License Key", key: "licenseKey", width: 16 },
    { header: "Issue Date", key: "issueDate", width: 12 },
    { header: "Expire Date", key: "expireDate", width: 12 },
    { header: "Seats", key: "seats", width: 10 },
    { header: "Status", key: "status", width: 14 },
    { header: "Days Remaining", key: "daysRemaining", width: 14 },
    { header: "Last Scanned", key: "lastScanned", width: 18 },
  ];
  wsLic.getRow(1).eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { horizontal: "center" };
  });

  const sortedLicenses = [...licenses].sort((a, b) =>
    a.customerName.localeCompare(b.customerName) || a.productName.localeCompare(b.productName));

  for (const lic of sortedLicenses) {
    const remaining = daysRemaining(lic.expireDate, timezone);
    let displayStatus: string;
    let fill: ExcelJS.Fill | null = null;

    if (lic.status === "PERPETUAL") {
      displayStatus = "Perpetual";
      fill = GREEN_FILL;
    } else if (!lic.expireDate || remaining === null) {
      displayStatus = "Unknown";
    } else if (remaining <= 0) {
      displayStatus = "Expired";
      fill = RED_FILL;
    } else if (remaining <= 30) {
      displayStatus = "Expiring Soon";
      fill = AMBER_FILL;
    } else {
      displayStatus = "Active";
      fill = GREEN_FILL;
    }

    const row = wsLic.addRow({
      customer: lic.customerName,
      soldTo: lic.soldTo ?? "",
      version: lic.version ?? "",
      product: lic.productName,
      vendor: lic.vendor ?? "",
      licenseKey: lic.licenseKey ?? "",
      issueDate: lic.issueDate ?? "",
      expireDate: lic.expireDate ?? "",
      seats: formatSeats(lic.seats),
      status: displayStatus,
      daysRemaining: remaining ?? "",
      lastScanned: lic.lastScannedAt.toISOString().slice(0, 16).replace("T", " "),
    });
    if (fill) row.getCell("status").fill = fill;
  }

  const wsAlerts = wb.addWorksheet("Alert History");
  wsAlerts.columns = [
    { header: "Customer", key: "customer", width: 24 },
    { header: "Product", key: "product", width: 16 },
    { header: "Threshold Days", key: "threshold", width: 14 },
    { header: "Expire Date", key: "expireDate", width: 12 },
    { header: "Recipients", key: "recipients", width: 32 },
    { header: "Sent At", key: "sentAt", width: 18 },
  ];
  wsAlerts.getRow(1).eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
  });
  for (const a of alerts) {
    wsAlerts.addRow({
      customer: a.customerName,
      product: a.productName,
      threshold: a.thresholdDays,
      expireDate: a.expireDate,
      recipients: a.recipients,
      sentAt: a.sentAt.toISOString().slice(0, 16).replace("T", " "),
    });
  }

  const buffer = await wb.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="License Information.xlsx"',
    },
  });
}
