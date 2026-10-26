/**
 * Pure, no-I/O sanitiser for the extra identifiers an AI parse surfaces (a
 * Kepware PDF's Emergency Activation ID, Hardware Key ID, Cert Required, …).
 * Lives in domain/ so it's unit-tested without a DB or the AI client, per the
 * architecture rule that domain/* takes objects and returns objects.
 */

export type LicenseAttribute = { label: string; value: string };

/** At most this many extra attributes per license, each field this many chars — bounds a hallucinated or runaway list before it reaches the DB/UI. */
export const MAX_ATTRIBUTES = 20;
export const MAX_ATTR_FIELD_CHARS = 200;

/**
 * Trim, drop blank label/value pairs, bound length and count. Returns `null`
 * (not `[]`) when nothing usable remains, matching the "no extras" case so a
 * caller can store it directly as the nullable `metadata` column.
 */
export function cleanAttributes(
  attributes: LicenseAttribute[] | null | undefined,
): LicenseAttribute[] | null {
  if (!attributes) return null;
  const cleaned = attributes
    .map((a) => ({ label: a.label.trim().slice(0, MAX_ATTR_FIELD_CHARS), value: a.value.trim().slice(0, MAX_ATTR_FIELD_CHARS) }))
    .filter((a) => a.label && a.value)
    .slice(0, MAX_ATTRIBUTES);
  return cleaned.length > 0 ? cleaned : null;
}
