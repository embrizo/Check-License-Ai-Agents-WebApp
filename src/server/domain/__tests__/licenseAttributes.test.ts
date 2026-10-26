import { describe, it, expect } from "vitest";
import { cleanAttributes, MAX_ATTRIBUTES, MAX_ATTR_FIELD_CHARS } from "../licenseAttributes";

describe("cleanAttributes", () => {
  it("returns null for null/undefined input", () => {
    expect(cleanAttributes(null)).toBeNull();
    expect(cleanAttributes(undefined)).toBeNull();
  });

  it("returns null (not []) when nothing usable remains", () => {
    expect(cleanAttributes([])).toBeNull();
    expect(cleanAttributes([{ label: "  ", value: "x" }])).toBeNull();
    expect(cleanAttributes([{ label: "x", value: "   " }])).toBeNull();
  });

  it("trims and keeps valid pairs", () => {
    expect(cleanAttributes([{ label: " Hardware Key ID ", value: " abc123 " }])).toEqual([
      { label: "Hardware Key ID", value: "abc123" },
    ]);
  });

  it("drops only the blank pairs, keeps the rest", () => {
    expect(
      cleanAttributes([
        { label: "A", value: "1" },
        { label: "", value: "2" },
        { label: "B", value: "3" },
      ]),
    ).toEqual([
      { label: "A", value: "1" },
      { label: "B", value: "3" },
    ]);
  });

  it("caps the number of attributes", () => {
    const many = Array.from({ length: MAX_ATTRIBUTES + 5 }, (_, i) => ({ label: `l${i}`, value: `v${i}` }));
    expect(cleanAttributes(many)).toHaveLength(MAX_ATTRIBUTES);
  });

  it("caps each field's length", () => {
    const [attr] = cleanAttributes([{ label: "L".repeat(500), value: "V".repeat(500) }])!;
    expect(attr.label).toHaveLength(MAX_ATTR_FIELD_CHARS);
    expect(attr.value).toHaveLength(MAX_ATTR_FIELD_CHARS);
  });
});
