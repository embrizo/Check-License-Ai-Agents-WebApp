import { describe, it, expect } from "vitest";
import { stripUnstorableChars } from "../textSanitize";

describe("stripUnstorableChars", () => {
  it("removes NUL bytes (the Postgres-breaking char)", () => {
    expect(stripUnstorableChars("a\u0000b")).toBe("ab");
    expect(stripUnstorableChars("\u0000\u0000")).toBe("");
  });

  it("cleans the real failure case: Thai text with pdf.js NULs stays readable", () => {
    // pdf.js dropped a glyph in จัดฝึก and emitted U+0000 in its place.
    const extracted = "จัดฝ\u0000กอบรม เลขที\u0000 0501";
    const cleaned = stripUnstorableChars(extracted);
    expect(cleaned).toBe("จัดฝกอบรม เลขที 0501");
    expect(cleaned).not.toContain("\u0000");
  });

  it("drops other C0 control chars", () => {
    expect(stripUnstorableChars("x\u0001\u0007\u001fy")).toBe("xy");
    expect(stripUnstorableChars("a\u000bb\u000cc")).toBe("abc");
  });

  it("preserves tab, newline and carriage return", () => {
    expect(stripUnstorableChars("a\tb\nc\r\nd")).toBe("a\tb\nc\r\nd");
  });

  it("leaves ordinary text untouched", () => {
    const s = "INCREMENT nx11101 siemens 34.0 31-dec-2026 5";
    expect(stripUnstorableChars(s)).toBe(s);
  });
});
