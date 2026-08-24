import { describe, it, expect } from "vitest";
import { isSendHour } from "../thresholds";

describe("isSendHour", () => {
  // 2026-08-24T01:00:00Z is 08:00 in Asia/Bangkok (UTC+7).
  const at01Utc = new Date("2026-08-24T01:00:00Z");

  it("matches the configured hour in the org's timezone", () => {
    expect(isSendHour(8, "Asia/Bangkok", at01Utc)).toBe(true);
  });

  it("is false at any other hour", () => {
    expect(isSendHour(7, "Asia/Bangkok", at01Utc)).toBe(false);
    expect(isSendHour(9, "Asia/Bangkok", at01Utc)).toBe(false);
    expect(isSendHour(1, "Asia/Bangkok", at01Utc)).toBe(false);
  });

  it("uses the org timezone, not UTC (the whole point)", () => {
    // Same instant is hour 1 in UTC but hour 8 in Bangkok.
    expect(isSendHour(1, "UTC", at01Utc)).toBe(true);
    expect(isSendHour(8, "UTC", at01Utc)).toBe(false);
  });

  it("handles a different timezone's offset", () => {
    // 01:00 UTC is 21:00 the previous day in America/New_York (UTC-4 in Aug).
    expect(isSendHour(21, "America/New_York", at01Utc)).toBe(true);
  });
});
