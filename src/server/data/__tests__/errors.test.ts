import { describe, it, expect } from "vitest";
import { isUniqueViolation } from "../errors";

/**
 * The nesting here is not hypothetical — it's the shape Drizzle + the Neon
 * HTTP driver actually produce, captured from a real duplicate insert against
 * the database. A first version of this helper only looked at the top-level
 * error, where `code` and `constraint` are both undefined, so every duplicate
 * was misclassified as an unknown error and crashed the page.
 */
function drizzleWrapped(constraint: string) {
  const inner = Object.assign(new Error("duplicate key value violates unique constraint"), {
    code: "23505",
    constraint,
    severity: "ERROR",
  });
  return Object.assign(new Error("Failed query: insert into \"users\" ..."), { cause: inner });
}

describe("isUniqueViolation", () => {
  it("finds the pg error nested under `cause`", () => {
    expect(isUniqueViolation(drizzleWrapped("uq_users_email"))).toBe(true);
  });

  it("matches a specific constraint through the wrapper", () => {
    expect(isUniqueViolation(drizzleWrapped("uq_users_email"), "uq_users_email")).toBe(true);
  });

  it("does not match a different constraint", () => {
    expect(isUniqueViolation(drizzleWrapped("uq_contact_customer_email"), "uq_users_email")).toBe(false);
  });

  it("still handles an unwrapped driver error", () => {
    const flat = Object.assign(new Error("dup"), { code: "23505", constraint: "uq_users_email" });
    expect(isUniqueViolation(flat, "uq_users_email")).toBe(true);
  });

  it("reads the constraint out of the message when the field is absent", () => {
    const e = Object.assign(new Error(
      'duplicate key value violates unique constraint "uq_users_email"',
    ), { code: "23505" });
    expect(isUniqueViolation(e, "uq_users_email")).toBe(true);
  });

  it("rejects unrelated errors rather than swallowing them", () => {
    expect(isUniqueViolation(new Error("connection reset"))).toBe(false);
    expect(isUniqueViolation(Object.assign(new Error("bad input"), { code: "22P02" }))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("a string")).toBe(false);
  });

  it("terminates on a self-referential cause chain", () => {
    const e: { cause?: unknown } = {};
    e.cause = e;
    expect(isUniqueViolation(e)).toBe(false);
  });
});
