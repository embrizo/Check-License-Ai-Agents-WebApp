import { describe, it, expect } from "vitest";
import {
  computeExpiry, findPreset, isValidDateString, CERT_TYPE_PRESETS,
} from "../certificates";

describe("computeExpiry", () => {
  it("adds whole-year cycles", () => {
    expect(computeExpiry("2026-08-20", 60)).toBe("2031-08-20"); // confined space, 5y
    expect(computeExpiry("2026-08-20", 24)).toBe("2028-08-20"); // work at height, 2y
    expect(computeExpiry("2026-01-01", 12)).toBe("2027-01-01"); // yearly inspection
  });

  it("handles month-length overflow", () => {
    expect(computeExpiry("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("handles leap years", () => {
    expect(computeExpiry("2024-02-29", 12)).toBe("2025-02-28");
    expect(computeExpiry("2024-02-29", 48)).toBe("2028-02-29");
  });
});

describe("findPreset", () => {
  it("resolves a known Thai cert type to its renewal cycle", () => {
    expect(findPreset("ที่อับอากาศ")?.renewalMonths).toBe(60);
    expect(findPreset("ซ้อมหนีไฟ")?.category).toBe("inspection");
  });

  it("returns undefined for a custom type", () => {
    expect(findPreset("something custom")).toBeUndefined();
  });
});

describe("CERT_TYPE_PRESETS", () => {
  it("covers both categories and has positive cycles", () => {
    expect(CERT_TYPE_PRESETS.some((p) => p.category === "personal")).toBe(true);
    expect(CERT_TYPE_PRESETS.some((p) => p.category === "inspection")).toBe(true);
    expect(CERT_TYPE_PRESETS.every((p) => p.renewalMonths > 0)).toBe(true);
  });
});

describe("isValidDateString", () => {
  it("accepts real dates", () => {
    expect(isValidDateString("2026-08-20")).toBe(true);
    expect(isValidDateString("2024-02-29")).toBe(true);
  });
  it("rejects malformed or impossible dates", () => {
    expect(isValidDateString("")).toBe(false);
    expect(isValidDateString("2026-13-01")).toBe(false);
    expect(isValidDateString("2026-02-31")).toBe(false);
    expect(isValidDateString("20-08-2026")).toBe(false);
  });
});
