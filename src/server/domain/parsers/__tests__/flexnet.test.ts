import { describe, it, expect } from "vitest";
import { parse } from "../flexnet";

// Mirrors the real extracted-strings layout of a PTC FlexNet capability
// response: a host-identity header, three feature records, and inter-record
// noise (a signature after each record, plus a stray "fto^" marker before the
// third) — to prove the anchor-relative parse isn't thrown off by it.
const SAMPLE = [
  "BACK_OFFICE",
  "BACK_OFFICE",
  "70e027b6-8bda-43eb-ab1b-bea1e2882f24",
  "twx_named_user",
  "ptc_p",
  "26-may-2027",
  "ProductName:THINGWORX_FOUNDATION,LicenseModel:paid,IsEnforced:false",
  "70e027b6-8bda-43eb-ab1b-bea1e2882f24",
  "11-oct-2026",
  "630001~MATERIAL_AUTOMATION_(THAILAND)_CO.,_LTD.",
  "SCN:630001",
  "Uo02kDfshL+k4Gr4hNf0lQ",
  "twx_telemetry_data_exception",
  "ptc_p",
  "31-dec-9999",
  "ProductName:TWX_PLATFORM,LicenseModel:paid,IsEnforced:false",
  "70e027b6-8bda-43eb-ab1b-bea1e2882f24",
  "11-oct-2026",
  "630001~MATERIAL_AUTOMATION_(THAILAND)_CO.,_LTD.",
  "SCN:630001",
  "AwHB0QCBxZFoas0dUAVQ3g",
  "fto^",
  "twx_shutdown",
  "ptc_p",
  "26-may-2027",
  "ProductName:THINGWORX_FOUNDATION,LicenseModel:paid,IsEnforced:true,IsInternal:true,DelayedEnforcement:90",
  "70e027b6-8bda-43eb-ab1b-bea1e2882f24",
  "11-oct-2026",
  "630001~MATERIAL_AUTOMATION_(THAILAND)_CO.,_LTD.",
  "SCN:630001",
  "Z/BOqtBG74k/FQpL6tOlTQ",
].join("\n");

describe("flexnet.parse", () => {
  const { licenses, warnings } = parse(SAMPLE);

  it("finds exactly the three feature records (ignoring header + noise)", () => {
    expect(licenses.map((l) => l.productName)).toEqual([
      "twx_named_user",
      "twx_telemetry_data_exception",
      "twx_shutdown",
    ]);
    expect(warnings).toEqual([]);
  });

  it("parses a dated feature with vendor, expiry, customer and attributes", () => {
    const lic = licenses[0];
    expect(lic.vendor).toBe("ptc_p");
    expect(lic.expireDate).toBe("2027-05-26");
    expect(lic.status).toBe("ACTIVE");
    expect(lic.seats).toBeNull();
    expect(lic.licenseKey).toBe("70e027b6-8bda-43eb-ab1b-bea1e2882f24");
    expect(lic.soldTo).toBe("MATERIAL AUTOMATION (THAILAND) CO., LTD.");
    expect(lic.attributes).toEqual([
      { label: "Product", value: "THINGWORX_FOUNDATION" },
      { label: "License model", value: "paid" },
      { label: "Enforced", value: "false" },
      { label: "SCN", value: "630001" },
      { label: "Issued", value: "11-oct-2026" },
    ]);
  });

  it("treats the 31-dec-9999 sentinel as perpetual (no expiry)", () => {
    const lic = licenses[1];
    expect(lic.status).toBe("PERPETUAL");
    expect(lic.expireDate).toBeNull();
  });

  it("captures internal / delayed-enforcement attributes when present", () => {
    const lic = licenses[2];
    expect(lic.attributes).toEqual(
      expect.arrayContaining([
        { label: "Internal", value: "true" },
        { label: "Delayed enforcement (days)", value: "90" },
      ]),
    );
  });

  it("skips a record whose expiry token isn't a date", () => {
    const bad = [
      "feature_x",
      "ptc_p",
      "not-a-date",
      "ProductName:FOO,LicenseModel:paid,IsEnforced:true",
    ].join("\n");
    const res = parse(bad);
    expect(res.licenses).toEqual([]);
    expect(res.warnings).toHaveLength(1);
  });
});
