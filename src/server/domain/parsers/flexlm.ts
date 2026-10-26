/**
 * Direct port of engine/scanner/parsers/flexlm.py from the desktop app
 * (D1 in docs/01-architecture.md). Pure, no I/O — takes a string, returns
 * objects. Keep this in sync with the Python behaviour rather than
 * "improving" it; the desktop parser is the specification here, not a
 * starting point.
 *
 * Typical FlexLM INCREMENT line:
 *   INCREMENT feature vendor version expire_date seats [optional_fields]
 *   INCREMENT nx11101 siemens 34.0 31-dec-2026 5 VENDOR_STRING=... SN=123456
 */

import type { LicenseAttribute } from "@/server/domain/licenseAttributes";

export type LicenseStatus = "ACTIVE" | "PERPETUAL" | "UNKNOWN";

export interface ParsedLicense {
  productName: string;
  vendor: string | null;
  licenseKey: string | null;
  expireDate: string | null; // ISO YYYY-MM-DD, or null for perpetual
  seats: number | null;
  status: LicenseStatus;
  soldTo: string | null;
  version: string | null;
  /** Extra identifiers with no dedicated column (used by the FlexNet parser; left undefined by FlexLM). Stored on licenses.metadata. */
  attributes?: LicenseAttribute[] | null;
}

export interface ParseResult {
  licenses: ParsedLicense[];
  /** Lines that looked like INCREMENT/FEATURE but couldn't be parsed (e.g. bad date) — surfaced, not silently dropped. */
  warnings: string[];
}

const LINE_PATTERN = /^(?:INCREMENT|FEATURE)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)/i;
const SN_PATTERN = /SN=(\S+)/i;
const SOLD_TO_PATTERN = /Sold-To\/Install:\s*([^\s#]+)/i;
const HEADER_VERSION_PATTERN = /Version:\s*([^\s#]+)/i;

const PERPETUAL_SENTINELS = new Set(["permanent", "0", "1-jan-0", "1-jan-1990"]);

/**
 * FlexLM's `uncounted` keyword means "unlimited seats". The desktop parser
 * stores it as this sentinel rather than null (null already means "no seat
 * count in the file at all"), and the port keeps that behaviour — but every
 * consumer must render it via `formatSeats`, or the raw 999999 reaches the
 * user. See src/server/domain/seats.ts.
 */
export const UNCOUNTED_SEATS = 999_999;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Parses FlexLM's `%d-%b-%Y` date format (e.g. "31-dec-2026"). Returns null if not a real calendar date. Exported for reuse by the FlexNet parser, whose dates use the same format. */
export function parseFlexlmDate(value: string): string | null {
  const match = /^(\d{1,2})-([a-z]{3})-(\d{1,4})$/i.exec(value);
  if (!match) return null;

  const day = Number(match[1]);
  const month = MONTHS[match[2].toLowerCase()];
  const year = Number(match[3]);
  if (!month || year < 1) return null;

  // Validate it's a real date (rejects e.g. 31-feb-2026) by round-tripping
  // through UTC and checking the components didn't get normalised away.
  const asDate = new Date(Date.UTC(year, month - 1, day));
  if (
    asDate.getUTCFullYear() !== year ||
    asDate.getUTCMonth() !== month - 1 ||
    asDate.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parse(content: string): ParseResult {
  const licenses: ParsedLicense[] = [];
  const warnings: string[] = [];

  // Strip a UTF-8 BOM if present, and normalise CRLF/CR to LF before splitting.
  const BOM = String.fromCharCode(0xfeff);
  const withoutBom = content.startsWith(BOM) ? content.slice(BOM.length) : content;
  const normalized = withoutBom.replace(/\r\n?/g, "\n");

  const soldTo = SOLD_TO_PATTERN.exec(normalized)?.[1] ?? null;
  const headerVersion = HEADER_VERSION_PATTERN.exec(normalized)?.[1] ?? null;

  const lines = normalized.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;

    const match = LINE_PATTERN.exec(line);
    if (!match) continue;

    const [, feature, vendor, incVersion, expiryRaw, seatsRaw] = match;
    const expiryStr = expiryRaw.toLowerCase();

    const snMatch = SN_PATTERN.exec(line);
    const licenseKey = snMatch ? snMatch[1] : null;

    let expireDate: string | null = null;
    let status: LicenseStatus = "ACTIVE";

    if (PERPETUAL_SENTINELS.has(expiryStr)) {
      status = "PERPETUAL";
    } else {
      const parsed = parseFlexlmDate(expiryStr);
      if (!parsed) {
        warnings.push(`Line ${lineNum}: could not parse expiry date "${expiryRaw}" — skipped`);
        continue;
      }
      expireDate = parsed;
    }

    let seats: number | null = null;
    if (/^\d+$/.test(seatsRaw)) {
      seats = Number(seatsRaw);
    } else if (seatsRaw.toLowerCase() === "uncounted") {
      seats = UNCOUNTED_SEATS;
    }

    licenses.push({
      productName: feature,
      vendor: vendor ?? null,
      licenseKey,
      expireDate,
      seats,
      status,
      soldTo,
      version: headerVersion ?? incVersion ?? null,
    });
  }

  return { licenses, warnings };
}
