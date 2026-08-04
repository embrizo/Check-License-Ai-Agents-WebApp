import { describe, it, expect } from "vitest";
import { parse } from "../flexlm";

// Same fixture as the desktop app's engine/tests/fixtures/sample_flexlm.lic —
// this parser is a port, not a rewrite, and must match its behaviour exactly.
const FIXTURE = [
  "# Sample flexlm license for testing",
  "SERVER this_host ANY",
  "VENDOR siemens",
  "USE_SERVER",
  "INCREMENT nx11101 siemens 34.0 31-dec-2026 5 VENDOR_STRING=TEST_USER SN=123456",
  "INCREMENT nx22202 siemens 34.0 permanent uncounted VENDOR_STRING=TEST_USER",
  "INCREMENT nx33303 siemens 34.0 15-aug-2026 2 VENDOR_STRING=TEST_USER SN=789012",
  "FEATURE nx44404 siemens 34.0 1-jan-1990 uncounted HOSTID=ANY",
  "",
].join("\n");

describe("flexlm parser — port of engine/tests/test_scanner.py::test_flexlm_parser", () => {
  it("parses all 4 lines from the desktop fixture", () => {
    const { licenses, warnings } = parse(FIXTURE);
    expect(warnings).toEqual([]);
    expect(licenses).toHaveLength(4);
  });

  it("parses a dated, seat-limited license", () => {
    const { licenses } = parse(FIXTURE);
    expect(licenses[0]).toMatchObject({
      productName: "nx11101",
      vendor: "siemens",
      expireDate: "2026-12-31",
      seats: 5,
      status: "ACTIVE",
      licenseKey: "123456",
    });
  });

  it("treats 'permanent' + 'uncounted' as perpetual with 999999 seats", () => {
    const { licenses } = parse(FIXTURE);
    expect(licenses[1]).toMatchObject({
      productName: "nx22202",
      expireDate: null,
      seats: 999_999,
      status: "PERPETUAL",
      licenseKey: null,
    });
  });

  it("parses a second dated license independently", () => {
    const { licenses } = parse(FIXTURE);
    expect(licenses[2]).toMatchObject({
      productName: "nx33303",
      expireDate: "2026-08-15",
      seats: 2,
      status: "ACTIVE",
    });
  });

  it("treats the 1-jan-1990 sentinel as perpetual too", () => {
    const { licenses } = parse(FIXTURE);
    expect(licenses[3]).toMatchObject({
      productName: "nx44404",
      expireDate: null,
      status: "PERPETUAL",
    });
  });
});

describe("flexlm parser — edge cases (docs/06 Phase 2a checklist)", () => {
  it("is unaffected by a UTF-8 BOM at the start of the file", () => {
    const withBom = String.fromCharCode(0xfeff) + FIXTURE;
    const { licenses } = parse(withBom);
    expect(licenses).toHaveLength(4);
    expect(licenses[0].productName).toBe("nx11101");
  });

  it("handles CRLF line endings", () => {
    const crlf = FIXTURE.replace(/\n/g, "\r\n");
    const { licenses } = parse(crlf);
    expect(licenses).toHaveLength(4);
  });

  it("handles bare CR line endings", () => {
    const cr = FIXTURE.replace(/\n/g, "\r");
    const { licenses } = parse(cr);
    expect(licenses).toHaveLength(4);
  });

  it("skips a malformed expiry date with a warning instead of throwing", () => {
    const bad = "INCREMENT nxbad siemens 34.0 31-mud-2026 5 SN=999";
    const { licenses, warnings } = parse(bad);
    expect(licenses).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/nxbad|31-mud-2026/i);
  });

  it("rejects a calendar-invalid date (Feb 30) rather than silently normalising it", () => {
    const bad = "INCREMENT nxbad siemens 34.0 30-feb-2026 5";
    const { licenses, warnings } = parse(bad);
    expect(licenses).toHaveLength(0);
    expect(warnings).toHaveLength(1);
  });

  it("ignores blank lines and comment lines", () => {
    const withNoise = `\n\n# a comment\n${FIXTURE}\n# trailing comment\n\n`;
    const { licenses } = parse(withNoise);
    expect(licenses).toHaveLength(4);
  });

  it("extracts Sold-To and header Version and applies them to every license", () => {
    const withHeader = `# Sold-To/Install: ACME-CORP\n# Version: 99.9\n${FIXTURE}`;
    const { licenses } = parse(withHeader);
    for (const lic of licenses) {
      expect(lic.soldTo).toBe("ACME-CORP");
      expect(lic.version).toBe("99.9");
    }
  });

  it("falls back to the INCREMENT line's own version when there's no header Version", () => {
    const { licenses } = parse(FIXTURE);
    expect(licenses[0].version).toBe("34.0");
  });

  it("returns an empty result (not an error) for content with no recognisable lines", () => {
    const { licenses, warnings } = parse("this is not a license file\njust some text\n");
    expect(licenses).toEqual([]);
    expect(warnings).toEqual([]);
  });
});
