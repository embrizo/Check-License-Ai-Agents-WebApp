/**
 * Parses a PTC/FlexNet Embedded "capability response" after its printable
 * strings have been extracted (see domain/binaryStrings.ts). The binary itself
 * is signed and opaque, but every feature entitlement is laid out as a fixed,
 * contiguous run of ASCII tokens:
 *
 *   <feature> <vendor> <expiry> ProductName:…,LicenseModel:…,IsEnforced:… \
 *   <entitlement-id> <issued> <customer> SCN:<scn> <signature>
 *
 * We anchor on the distinctive `ProductName:` token and read the surrounding
 * fields relative to it — the three tokens before it (feature, vendor, expiry)
 * are always contiguous, so inter-record noise (host identity, signatures,
 * stray markers) between records can't shift the mapping. Pure, no I/O.
 *
 * Seat/quantity counts live in the binary layer, not the readable strings, so
 * they are intentionally not recovered here (ParsedLicense.seats stays null).
 */

import { parseFlexlmDate } from "./flexlm";
import type { ParsedLicense, ParseResult } from "./flexlm";
import type { LicenseAttribute } from "@/server/domain/licenseAttributes";

const DATE_RE = /^\d{1,2}-[a-z]{3}-\d{1,4}$/i;
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRODUCT_MARKER = "ProductName:";
/** FlexNet's "never expires" sentinel — a real date, but it means perpetual. */
const PERPETUAL_DATE = "31-dec-9999";

/** Split "Key:Val,Key2:Val2" into a lookup. Values may themselves contain no comma (FlexNet uses them only as field separators). */
function parseKeyValues(token: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of token.split(",")) {
    const idx = part.indexOf(":");
    if (idx > 0) out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

/** "630001~MATERIAL_AUTOMATION_(THAILAND)_CO.,_LTD." → { scn: "630001", name: "MATERIAL AUTOMATION (THAILAND) CO., LTD." } */
function parseCustomer(token: string): { scn: string | null; name: string | null } {
  const tilde = token.indexOf("~");
  if (tilde < 0) return { scn: null, name: token.replace(/_/g, " ").trim() || null };
  const scn = token.slice(0, tilde).trim() || null;
  const name = token.slice(tilde + 1).replace(/_/g, " ").trim() || null;
  return { scn, name };
}

export function parse(content: string): ParseResult {
  const licenses: ParsedLicense[] = [];
  const warnings: string[] = [];

  const tokens = content.split("\n").map((t) => t.trim()).filter(Boolean);

  for (let i = 0; i < tokens.length; i++) {
    if (!tokens[i].startsWith(PRODUCT_MARKER)) continue;
    if (i < 3) {
      warnings.push(`A capability entry at token ${i + 1} was missing its feature/vendor/expiry fields — skipped`);
      continue;
    }

    const feature = tokens[i - 3];
    const vendor = tokens[i - 2];
    const expiryRaw = tokens[i - 1];
    const fields = parseKeyValues(tokens[i]);

    // expiry is the one field we refuse to guess at: a bad one means the record
    // isn't shaped the way we assume, so skip it rather than attribute a wrong date.
    const expiryLower = expiryRaw.toLowerCase();
    let expireDate: string | null = null;
    let status: ParsedLicense["status"] = "ACTIVE";
    if (expiryLower === PERPETUAL_DATE) {
      status = "PERPETUAL";
    } else if (!DATE_RE.test(expiryRaw)) {
      warnings.push(`Feature "${feature}": unexpected expiry token "${expiryRaw}" — skipped`);
      continue;
    } else {
      const parsed = parseFlexlmDate(expiryLower);
      if (!parsed) {
        warnings.push(`Feature "${feature}": could not parse expiry "${expiryRaw}" — skipped`);
        continue;
      }
      expireDate = parsed;
    }

    // Best-effort forward fields (never skip the record over these).
    const entitlementId = GUID_RE.test(tokens[i + 1] ?? "") ? tokens[i + 1] : null;
    const issued = DATE_RE.test(tokens[i + 2] ?? "") ? tokens[i + 2] : null;
    const customerTok = tokens[i + 3] ?? "";
    const scnTok = tokens[i + 4] ?? "";
    const { scn: scnFromCustomer, name: customerName } = parseCustomer(customerTok);
    const scn = scnTok.startsWith("SCN:") ? scnTok.slice("SCN:".length).trim() : scnFromCustomer;

    const attributes: LicenseAttribute[] = [];
    const push = (label: string, value: string | null | undefined) => {
      if (value) attributes.push({ label, value });
    };
    push("Product", fields.ProductName);
    push("License model", fields.LicenseModel);
    push("Enforced", fields.IsEnforced);
    if (fields.IsInternal) push("Internal", fields.IsInternal);
    if (fields.DelayedEnforcement) push("Delayed enforcement (days)", fields.DelayedEnforcement);
    push("SCN", scn);
    push("Issued", issued);

    licenses.push({
      productName: feature,
      vendor: vendor || null,
      licenseKey: entitlementId,
      expireDate,
      seats: null, // counts are in the binary layer, not the readable strings
      status,
      soldTo: customerName,
      version: fields.LicenseModel ?? null,
      attributes: attributes.length > 0 ? attributes : null,
    });
  }

  return { licenses, warnings };
}
