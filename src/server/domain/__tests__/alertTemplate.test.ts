import { describe, it, expect } from "vitest";
import { renderAlertEmail } from "../alertTemplate";

describe("renderAlertEmail", () => {
  const params = {
    customer: "Acme Corp",
    soldTo: "ACME-CORP",
    version: "34.0",
    product: "nx11101",
    expireDate: "2026-12-31",
    daysRemaining: 15,
  };

  it("matches the desktop subject format from alert_email.txt", () => {
    const { subject } = renderAlertEmail(params);
    expect(subject).toBe("[License Alert] Acme Corp - nx11101 expires in 15 days (2026-12-31)");
  });

  it("includes every field in the plain-text body", () => {
    const { text } = renderAlertEmail(params);
    expect(text).toContain("Customer: Acme Corp");
    expect(text).toContain("Sold-To/Install: ACME-CORP");
    expect(text).toContain("Version: 34.0");
    expect(text).toContain("Product: nx11101");
    expect(text).toContain("Expiration Date: 2026-12-31");
    expect(text).toContain("Days Remaining: 15");
  });

  it("falls back to N/A for missing soldTo/version", () => {
    const { text } = renderAlertEmail({ ...params, soldTo: null, version: null });
    expect(text).toContain("Sold-To/Install: N/A");
    expect(text).toContain("Version: N/A");
  });

  it("HTML-escapes values to avoid injection via customer/product names", () => {
    const { html } = renderAlertEmail({ ...params, customer: "<script>alert(1)</script>" });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
