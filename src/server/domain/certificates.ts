import { addMonths } from "date-fns";

/**
 * Pure domain logic for safety/compliance certificates. No I/O (strings/objects
 * in, strings/objects out), so it's unit-testable without a database — the same
 * D-rule the license parsers and thresholds follow. The expiry/threshold maths
 * for certs is deliberately the SAME as for licenses: see thresholds.ts
 * (daysRemaining / bucketFor) and alertLogic.ts (selectThreshold), which both
 * take a plain `YYYY-MM-DD` and are reused unchanged for certs.
 */

/** Mirrors the `cert_category` pg enum. Kept standalone so this stays pure. */
export type CertCategory = "personal" | "inspection";

export interface CertTypePreset {
  /** Stored verbatim in `certificates.cert_type`. Thai, as the user names it. */
  value: string;
  labelEn: string;
  category: CertCategory;
  /** Default renewal cycle, in months, pre-filling the form. Editable there. */
  renewalMonths: number;
}

/**
 * The cert types seeded from the user's own list. Not a DB enum: the type is a
 * free-text column so an org can add its own without a migration. These are
 * just the presets that pre-fill the renewal cycle in the form.
 */
export const CERT_TYPE_PRESETS: CertTypePreset[] = [
  // Personal training certificates — held by an employee, lapse on a cycle.
  { value: "ที่อับอากาศ", labelEn: "Confined space", category: "personal", renewalMonths: 60 },
  { value: "ที่สูง", labelEn: "Work at height", category: "personal", renewalMonths: 24 },
  { value: "ช่างไฟฟ้าอาคาร", labelEn: "Building electrician", category: "personal", renewalMonths: 60 },
  // Recurring site/building inspections and drills — yearly.
  { value: "ตรวจอาคาร", labelEn: "Building inspection", category: "inspection", renewalMonths: 12 },
  { value: "ตรวจไฟฟ้า", labelEn: "Electrical inspection", category: "inspection", renewalMonths: 12 },
  { value: "ซ้อมหนีไฟ", labelEn: "Fire drill", category: "inspection", renewalMonths: 12 },
];

export function findPreset(certType: string): CertTypePreset | undefined {
  return CERT_TYPE_PRESETS.find((p) => p.value === certType);
}

/**
 * Expiry = issue date + renewalMonths. `addMonths` handles month-length overflow
 * (31 Jan + 1 month → 28 Feb). Computed from the calendar-day components, never a
 * UTC instant, so it can't drift across a timezone like `expireDate` elsewhere.
 *
 * This is only the DEFAULT — the form lets the user override the exact date,
 * because a real cert's printed expiry is sometimes the day before the
 * anniversary (e.g. issued 20 Aug 2026, valid "5 years", printed 19 Aug 2031).
 */
export function computeExpiry(issueDate: string, renewalMonths: number): string {
  const [y, m, d] = issueDate.split("-").map(Number);
  const result = addMonths(new Date(y, m - 1, d), renewalMonths);
  const yyyy = String(result.getFullYear()).padStart(4, "0");
  const mm = String(result.getMonth() + 1).padStart(2, "0");
  const dd = String(result.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** A plausible calendar date in YYYY-MM-DD. Rejects "", garbage, and 31-feb. */
export function isValidDateString(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
