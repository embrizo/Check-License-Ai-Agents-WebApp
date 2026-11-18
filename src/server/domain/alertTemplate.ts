/**
 * Pure rendering, ported from engine/alerts/templates/alert_email.txt (and
 * the `{placeholder}` substitution in engine.py's `_split_template`). Kept
 * as plain string templates rather than React Email components for now —
 * swapping to @react-email/components later is a drop-in Phase 6 polish
 * item, not a behaviour change.
 */

export interface AlertEmailParams {
  customer: string;
  soldTo: string | null;
  version: string | null;
  product: string;
  expireDate: string; // YYYY-MM-DD
  daysRemaining: number;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export function renderAlertEmail(params: AlertEmailParams): RenderedEmail {
  const soldTo = params.soldTo ?? "N/A";
  const version = params.version ?? "N/A";

  const subject = `[License Alert] ${params.customer} - ${params.product} expires in ${params.daysRemaining} days (${params.expireDate})`;

  const text = [
    "Hello,",
    "",
    "This is an automated alert from the License Expiry Alert System.",
    "",
    `Customer: ${params.customer}`,
    `Sold-To/Install: ${soldTo}`,
    `Version: ${version}`,
    `Product: ${params.product}`,
    `Expiration Date: ${params.expireDate}`,
    `Days Remaining: ${params.daysRemaining}`,
    "",
    "Please take appropriate action to renew this license before it expires.",
    "",
    "Thank you.",
  ].join("\n");

  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#666;">${escapeHtml(label)}</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(value)}</td></tr>`;

  const html = `<div style="font-family:sans-serif;font-size:14px;color:#111;max-width:480px;">
  <p>Hello,</p>
  <p>This is an automated alert from the License Expiry Alert System.</p>
  <table cellspacing="0" cellpadding="0">
    ${row("Customer", params.customer)}
    ${row("Sold-To/Install", soldTo)}
    ${row("Version", version)}
    ${row("Product", params.product)}
    ${row("Expiration Date", params.expireDate)}
    ${row("Days Remaining", String(params.daysRemaining))}
  </table>
  <p>Please take appropriate action to renew this license before it expires.</p>
  <p>Thank you.</p>
</div>`;

  return { subject, text, html };
}

export interface CertAlertEmailParams {
  certType: string;
  holderName: string | null;   // null for inspections
  site: string | null;         // customer/site name, if grouped
  certNumber: string | null;
  expireDate: string;          // YYYY-MM-DD
  daysRemaining: number;
}

/**
 * The certificate equivalent of renderAlertEmail — same plain-string approach,
 * a distinct subject tag so it's filterable apart from license alerts. Holder is
 * the person for a personal cert; for a recurring inspection there's no holder,
 * so that row is dropped rather than shown blank.
 */
export function renderCertAlertEmail(params: CertAlertEmailParams): RenderedEmail {
  const subject = `[Certificate Alert] ${params.certType}${params.holderName ? ` - ${params.holderName}` : ""} expires in ${params.daysRemaining} days (${params.expireDate})`;

  const lines = [
    "Hello,",
    "",
    "This is an automated certificate-expiry alert.",
    "",
    `Certificate: ${params.certType}`,
    ...(params.holderName ? [`Holder: ${params.holderName}`] : []),
    ...(params.site ? [`Site: ${params.site}`] : []),
    ...(params.certNumber ? [`Certificate No.: ${params.certNumber}`] : []),
    `Expiration Date: ${params.expireDate}`,
    `Days Remaining: ${params.daysRemaining}`,
    "",
    "Please arrange renewal before it expires.",
    "",
    "Thank you.",
  ];
  const text = lines.join("\n");

  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#666;">${escapeHtml(label)}</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(value)}</td></tr>`;

  const html = `<div style="font-family:sans-serif;font-size:14px;color:#111;max-width:480px;">
  <p>Hello,</p>
  <p>This is an automated certificate-expiry alert.</p>
  <table cellspacing="0" cellpadding="0">
    ${row("Certificate", params.certType)}
    ${params.holderName ? row("Holder", params.holderName) : ""}
    ${params.site ? row("Site", params.site) : ""}
    ${params.certNumber ? row("Certificate No.", params.certNumber) : ""}
    ${row("Expiration Date", params.expireDate)}
    ${row("Days Remaining", String(params.daysRemaining))}
  </table>
  <p>Please arrange renewal before it expires.</p>
  <p>Thank you.</p>
</div>`;

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
