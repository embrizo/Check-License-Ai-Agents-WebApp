import { UNCOUNTED_SEATS } from "./parsers/flexlm";

/**
 * Pure, no I/O — see ./thresholds.ts.
 *
 * The single place the seat sentinel is turned back into words. `seats` has
 * three distinct meanings and they must not be collapsed:
 *   - a number   → that many seats
 *   - 999999     → FlexLM's `uncounted`, i.e. unlimited
 *   - null       → the file gave no seat count at all
 *
 * Rendering `seats ?? "Uncounted"` gets this exactly backwards: the sentinel
 * is not null, so it prints a literal 999999 in customer-facing spreadsheets
 * while the genuinely-unknown case gets labelled "Uncounted".
 */
export function formatSeats(seats: number | null): string {
  if (seats === null) return "—";
  if (seats === UNCOUNTED_SEATS) return "Uncounted";
  return String(seats);
}
