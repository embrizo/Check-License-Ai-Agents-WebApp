import { describe, it, expect } from "vitest";
import { matchesProductFilter, selectThreshold, dedupKey, buildRecipients, baseRecipientsFor } from "../alertLogic";

describe("matchesProductFilter", () => {
  it("matches everything when no regex is configured (docs/03 'null = all')", () => {
    expect(matchesProductFilter("anything-goes", null)).toBe(true);
  });

  it("filters by the configured regex", () => {
    const nxOnly = "^[nN][xX]\\d+$";
    expect(matchesProductFilter("nx11101", nxOnly)).toBe(true);
    expect(matchesProductFilter("NX99999", nxOnly)).toBe(true);
    expect(matchesProductFilter("acrobat-pro", nxOnly)).toBe(false);
  });

  it("fails open (matches) on a malformed regex rather than blocking every alert", () => {
    expect(matchesProductFilter("nx11101", "[unclosed")).toBe(true);
  });
});

describe("selectThreshold — boundaries from docs/06 Phase 3 checklist (0/1/15/16/30/31)", () => {
  const thresholds = [30, 15]; // default order in org_settings — must be sorted internally

  it.each([
    [0, null],    // already expired today — no fresh alert
    [-5, null],   // expired days ago
    [1, 15],      // just inside the tightest window
    [15, 15],     // exact boundary uses <=, not ==  (D11)
    [16, 30],     // just past the tight window, falls into the wider one
    [30, 30],     // exact boundary on the wide window
    [31, null],   // outside every window
  ] as const)("daysRemaining=%s -> %s", (remaining, expected) => {
    expect(selectThreshold(remaining, thresholds)).toBe(expected);
  });

  it("never alerts a perpetual/unknown-expiry license (null daysRemaining)", () => {
    expect(selectThreshold(null, thresholds)).toBeNull();
  });

  it("picks the smaller (more urgent) threshold regardless of input order", () => {
    expect(selectThreshold(10, [30, 15])).toBe(15);
    expect(selectThreshold(10, [15, 30])).toBe(15);
  });

  it("returns null when thresholds is empty", () => {
    expect(selectThreshold(10, [])).toBeNull();
  });
});

describe("dedupKey", () => {
  it("is case-insensitive on product name, matching engine.py's .upper()", () => {
    expect(dedupKey("cust-1", "nx11101")).toBe(dedupKey("cust-1", "NX11101"));
  });

  it("differs by customer even for the same product", () => {
    expect(dedupKey("cust-1", "nx11101")).not.toBe(dedupKey("cust-2", "nx11101"));
  });
});

describe("baseRecipientsFor — per-department routing (the isolation guarantee)", () => {
  const departmentRecipients = new Map<string, string[]>([
    ["nx", ["ops.nx@example.com"]],
    ["ptc", ["ops.ptc@example.com"]],
    ["empty", []],
  ]);
  const orgRecipients = ["org-wide@example.com"];

  it("routes a filed item to its OWN department's recipients, never another's or the org-wide list", () => {
    expect(baseRecipientsFor("nx", orgRecipients, departmentRecipients)).toEqual(["ops.nx@example.com"]);
    expect(baseRecipientsFor("ptc", orgRecipients, departmentRecipients)).toEqual(["ops.ptc@example.com"]);
  });

  it("falls back to the org-wide list only for an unfiled (null-department) item", () => {
    expect(baseRecipientsFor(null, orgRecipients, departmentRecipients)).toEqual(["org-wide@example.com"]);
  });

  it("stays quiet (empty, not org-wide) for a department whose recipients aren't configured", () => {
    // The department exists but has no recipients — must NOT leak to the
    // org-wide audience; dailyCheck surfaces this as a "no recipients" warning.
    expect(baseRecipientsFor("empty", orgRecipients, departmentRecipients)).toEqual([]);
  });

  it("returns empty for a department id missing from the map rather than the org-wide list", () => {
    expect(baseRecipientsFor("ghost", orgRecipients, departmentRecipients)).toEqual([]);
  });
});

describe("buildRecipients", () => {
  it("returns only org recipients when customer-contact notification is off", () => {
    const result = buildRecipients({
      baseRecipients: ["ops@example.com"],
      customerContacts: [{ email: "buyer@acme.com", notify: true }],
      notifyCustomerContacts: false,
    });
    expect(result).toEqual(["ops@example.com"]);
  });

  it("adds opted-in customer contacts when enabled", () => {
    const result = buildRecipients({
      baseRecipients: ["ops@example.com"],
      customerContacts: [
        { email: "buyer@acme.com", notify: true },
        { email: "silent@acme.com", notify: false },
      ],
      notifyCustomerContacts: true,
    });
    expect(result).toEqual(["ops@example.com", "buyer@acme.com"]);
  });

  it("de-duplicates a contact email already present in org recipients", () => {
    const result = buildRecipients({
      baseRecipients: ["shared@example.com"],
      customerContacts: [{ email: "shared@example.com", notify: true }],
      notifyCustomerContacts: true,
    });
    expect(result).toEqual(["shared@example.com"]);
  });

  it("de-duplicates case-insensitively — one person, one email", () => {
    const result = buildRecipients({
      baseRecipients: ["Ops@Example.com"],
      customerContacts: [{ email: "ops@example.com", notify: true }],
      notifyCustomerContacts: true,
    });
    expect(result).toEqual(["Ops@Example.com"]);
  });

  // The whole point: Resend rejects the entire send if any one recipient is
  // malformed, so a single bad address must not take the good ones down with
  // it. Silence is the worst possible outcome for an expiry alerter.
  it("drops a malformed org recipient and still delivers to the valid ones", () => {
    const result = buildRecipients({
      baseRecipients: ["ops@example.com", "ops@example", "  ", "finance@example.com"],
      customerContacts: [],
      notifyCustomerContacts: false,
    });
    expect(result).toEqual(["ops@example.com", "finance@example.com"]);
  });

  it("drops a malformed customer contact without losing the rest", () => {
    const result = buildRecipients({
      baseRecipients: ["ops@example.com"],
      customerContacts: [
        { email: "not-an-email", notify: true },
        { email: "buyer@acme.com", notify: true },
      ],
      notifyCustomerContacts: true,
    });
    expect(result).toEqual(["ops@example.com", "buyer@acme.com"]);
  });

  it("returns an empty list when every configured address is malformed", () => {
    const result = buildRecipients({
      baseRecipients: ["nope", "also@nope"],
      customerContacts: [],
      notifyCustomerContacts: false,
    });
    expect(result).toEqual([]);
  });

  it("trims surrounding whitespace so a pasted address is still deliverable", () => {
    const result = buildRecipients({
      baseRecipients: ["  ops@example.com  "],
      customerContacts: [],
      notifyCustomerContacts: false,
    });
    expect(result).toEqual(["ops@example.com"]);
  });
});
