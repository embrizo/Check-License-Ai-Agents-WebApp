/**
 * Pure decision logic ported from engine/alerts/engine.py::run_alerts. No
 * I/O — the daily job (src/server/jobs/dailyCheck.ts) is the impure
 * orchestrator; this is what's actually testable without a database.
 */

import { isValidEmail } from "./email";

/**
 * Desktop hardcoded this to `^[nN][xX]\d+$` (NX products only). The web app
 * makes it per-org config (`org_settings.productFilterRegex`) with `null`
 * meaning "no filter, alert on every product" — a deliberate behaviour
 * change from the desktop default, per docs/03 §2.
 */
export function matchesProductFilter(productName: string, regex: string | null): boolean {
  if (!regex) return true;
  try {
    return new RegExp(regex).test(productName);
  } catch {
    // A malformed regex saved in settings must not silently kill every
    // alert — fail open, matching "null = all" rather than "all blocked".
    return true;
  }
}

/**
 * `0 < daysRemaining <= threshold`, thresholds checked ascending (most
 * urgent first) — the exact rule from engine.py. Returns the single
 * threshold that applies, or null if none does.
 *
 * Note the `> 0`: an *already-expired* license does not get a fresh
 * "expires in N days" alert once it has actually expired — that's a
 * deliberate desktop behaviour, not an oversight. The dashboard's "Expired"
 * bucket is the visual indicator for that state; this function only decides
 * whether an *upcoming*-expiry email goes out.
 */
export function selectThreshold(daysRemaining: number | null, thresholds: number[]): number | null {
  if (daysRemaining === null || daysRemaining <= 0) return null;
  const sorted = [...thresholds].sort((a, b) => a - b);
  for (const t of sorted) {
    if (daysRemaining <= t) return t;
  }
  return null;
}

/** Case-insensitive per-run dedup key — engine.py uppercases product_name so re-uploaded/duplicate rows for the same (customer, product) only ever alert once per run. */
export function dedupKey(customerId: string, productName: string): string {
  return `${customerId}::${productName.toUpperCase()}`;
}

export interface AlertRecipientsInput {
  orgRecipients: string[];
  customerContacts: { email: string; notify: boolean }[];
  notifyCustomerContacts: boolean;
}

/**
 * Org-wide recipients plus opted-in customer contacts, deduplicated
 * case-insensitively and filtered to addresses a mail provider will accept.
 *
 * The filter is the important part. Resend rejects an entire send if any one
 * recipient is malformed, so without it a single typo'd address — in settings
 * or on any one contact — takes down every alert for the whole organization,
 * and keeps doing so daily: the send fails, so no `alert_log` row is written,
 * so the next run retries and fails identically. Dropping the bad address and
 * delivering to everyone else is strictly better than silence. Validation at
 * the form is the primary defence; this catches rows that predate it.
 */
export function buildRecipients(input: AlertRecipientsInput): string[] {
  const candidates = [...input.orgRecipients];
  if (input.notifyCustomerContacts) {
    for (const contact of input.customerContacts) {
      if (contact.notify && contact.email) candidates.push(contact.email);
    }
  }

  const recipients: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (!isValidEmail(trimmed)) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push(trimmed);
  }
  return recipients;
}
