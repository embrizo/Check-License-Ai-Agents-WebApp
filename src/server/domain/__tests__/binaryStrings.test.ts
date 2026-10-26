import { describe, it, expect } from "vitest";
import { extractPrintableStrings } from "../binaryStrings";

function bytes(...parts: (string | number[])[]): Uint8Array {
  const arr: number[] = [];
  for (const p of parts) {
    if (typeof p === "string") for (const ch of p) arr.push(ch.charCodeAt(0));
    else arr.push(...p);
  }
  return new Uint8Array(arr);
}

describe("extractPrintableStrings", () => {
  it("returns printable runs split on non-printable bytes", () => {
    const data = bytes([0, 0], "ABCD", [0], "ptc_p", [0xff]);
    expect(extractPrintableStrings(data)).toEqual(["ABCD", "ptc_p"]);
  });

  it("drops runs shorter than minLen", () => {
    const data = bytes("Hi", [0], "feature");
    expect(extractPrintableStrings(data)).toEqual(["feature"]); // "Hi" < 4
  });

  it("captures a trailing run with no terminator", () => {
    expect(extractPrintableStrings(bytes([0], "26-may-2027"))).toEqual(["26-may-2027"]);
  });

  it("honours a custom minLen", () => {
    expect(extractPrintableStrings(bytes("Hi", [0], "feature"), 2)).toEqual(["Hi", "feature"]);
  });
});
