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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
