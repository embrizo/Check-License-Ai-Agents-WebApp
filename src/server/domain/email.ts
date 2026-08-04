/**
 * Pure, no I/O — see the D-rule note in ./thresholds.ts.
 *
 * Deliberately conservative rather than RFC-5322 complete: the job here is to
 * catch the typo a human makes in a settings textarea ("ops@acme" with no TLD)
 * before it reaches the mail provider, not to adjudicate exotic-but-legal
 * addresses. Resend rejects a *whole* send if any one recipient is malformed,
 * so a single bad character in org settings silently takes down every expiry
 * alert for that tenant — which is exactly the failure this app exists to
 * prevent. False negatives here cost one address; false positives cost none.
 */
const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>.]+(\.[^\s@,;<>.]+)+$/;

export function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 254) return false;
  return EMAIL_PATTERN.test(trimmed);
}

/** Splits a comma/semicolon/newline-separated list into trimmed, non-empty entries. */
export function splitEmailList(value: string): string[] {
  return value.split(/[\n,;]/).map((s) => s.trim()).filter(Boolean);
}

export interface PartitionedEmails {
  valid: string[];
  invalid: string[];
}

/** Separates a list into deliverable addresses and the ones to complain about. */
export function partitionEmails(values: string[]): PartitionedEmails {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const value of values) {
    (isValidEmail(value) ? valid : invalid).push(value.trim());
  }
  return { valid, invalid };
}
