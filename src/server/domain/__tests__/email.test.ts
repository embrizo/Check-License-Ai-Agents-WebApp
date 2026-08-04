import { describe, it, expect } from "vitest";
import { isValidEmail, splitEmailList, partitionEmails } from "../email";
import { formatSeats } from "../seats";
import { UNCOUNTED_SEATS } from "../parsers/flexlm";

describe("isValidEmail", () => {
  it("accepts ordinary addresses", () => {
    expect(isValidEmail("ops@acme.com")).toBe(true);
    expect(isValidEmail("first.last+tag@sub.example.co.th")).toBe(true);
    expect(isValidEmail("  padded@acme.com  ")).toBe(true);
  });

  // The exact typo that motivated this: a missing TLD is accepted by
  // `<input type="email">` but rejected by the mail provider.
  it("rejects a missing TLD", () => {
    expect(isValidEmail("ops@acme")).toBe(false);
  });

  it("rejects the other shapes a human actually types", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("   ")).toBe(false);
    expect(isValidEmail("no-at-sign.com")).toBe(false);
    expect(isValidEmail("@acme.com")).toBe(false);
    expect(isValidEmail("ops@")).toBe(false);
    expect(isValidEmail("two@@acme.com")).toBe(false);
    expect(isValidEmail("has space@acme.com")).toBe(false);
    expect(isValidEmail("trailing@acme.com.")).toBe(false);
    expect(isValidEmail("a@b..com")).toBe(false);
  });

  it("rejects separators that would smuggle in a second recipient", () => {
    expect(isValidEmail("a@acme.com,b@acme.com")).toBe(false);
    expect(isValidEmail("a@acme.com;b@acme.com")).toBe(false);
    expect(isValidEmail("Ops <ops@acme.com>")).toBe(false);
  });

  it("rejects an address past the RFC length limit", () => {
    expect(isValidEmail(`${"a".repeat(250)}@acme.com`)).toBe(false);
  });
});

describe("splitEmailList", () => {
  it("splits on commas, semicolons and newlines, dropping empties", () => {
    expect(splitEmailList("a@x.com, b@x.com\nc@x.com;d@x.com")).toEqual([
      "a@x.com", "b@x.com", "c@x.com", "d@x.com",
    ]);
  });

  it("returns nothing for blank input", () => {
    expect(splitEmailList("")).toEqual([]);
    expect(splitEmailList("  ,  \n ")).toEqual([]);
  });
});

describe("partitionEmails", () => {
  it("separates deliverable addresses from the ones to complain about", () => {
    const { valid, invalid } = partitionEmails(["ops@acme.com", "ops@acme", "x@y.io"]);
    expect(valid).toEqual(["ops@acme.com", "x@y.io"]);
    expect(invalid).toEqual(["ops@acme"]);
  });
});

describe("formatSeats", () => {
  // The sentinel is not null, so `seats ?? "Uncounted"` printed 999999 to
  // customers while labelling the genuinely-unknown case "Uncounted".
  it("names the uncounted sentinel instead of printing it", () => {
    expect(formatSeats(UNCOUNTED_SEATS)).toBe("Uncounted");
    expect(formatSeats(999_999)).toBe("Uncounted");
  });

  it("distinguishes a real count from no count at all", () => {
    expect(formatSeats(5)).toBe("5");
    expect(formatSeats(0)).toBe("0");
    expect(formatSeats(null)).toBe("—");
  });
});
