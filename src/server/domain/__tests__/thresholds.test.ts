import { describe, it, expect } from "vitest";
import { daysRemaining, crossesThreshold, bucketFor } from "../thresholds";

describe("daysRemaining", () => {
  it("returns null for perpetual (no expiry date)", () => {
    expect(daysRemaining(null, "Asia/Bangkok")).toBeNull();
  });

  it("computes calendar-day difference in the given timezone", () => {
    const now = new Date("2026-01-01T20:00:00Z"); // 2026-01-02 03:00 in Bangkok (+7)
    expect(daysRemaining("2026-01-17", "Asia/Bangkok", now)).toBe(15);
  });

  it("is negative once expired", () => {
    const now = new Date("2026-01-10T00:00:00Z");
    expect(daysRemaining("2026-01-01", "Asia/Bangkok", now)).toBeLessThan(0);
  });
});

describe("crossesThreshold", () => {
  it("uses <= so a missed run still catches the license (D11)", () => {
    expect(crossesThreshold(15, 15)).toBe(true);
    expect(crossesThreshold(14, 15)).toBe(true);
    expect(crossesThreshold(16, 15)).toBe(false);
  });

  it("never fires for perpetual licenses", () => {
    expect(crossesThreshold(null, 30)).toBe(false);
  });
});

describe("bucketFor", () => {
  it.each([
    [null, "perpetual"],
    [-1, "expired"],
    [0, "expired"],
    [15, "critical"],
    [16, "warning"],
    [30, "warning"],
    [31, "ok"],
  ] as const)("remaining=%s -> %s", (remaining, expected) => {
    expect(bucketFor(remaining)).toBe(expected);
  });
});
