import { describe, expect, it } from "vitest";

import {
  isValidAmount,
  isValidAddress,
  isValidRequestId,
  isValidInquiryId,
} from "@/lib/validation";

describe("isValidAmount", () => {
  it("accepts positive decimals up to 6 dp", () => {
    expect(isValidAmount("1")).toBe(true);
    expect(isValidAmount("0.5")).toBe(true);
    expect(isValidAmount("123.456789")).toBe(true);
    expect(isValidAmount(" 10 ")).toBe(true); // trimmed
  });

  it("rejects zero, negatives, junk, >6 dp, and non-strings", () => {
    expect(isValidAmount("0")).toBe(false);
    expect(isValidAmount("-1")).toBe(false);
    expect(isValidAmount("1.2345678")).toBe(false);
    expect(isValidAmount("abc")).toBe(false);
    expect(isValidAmount("")).toBe(false);
    expect(isValidAmount(5 as unknown)).toBe(false);
  });
});

describe("isValidAddress", () => {
  it("accepts a 40-hex 0x address", () => {
    expect(isValidAddress("0x" + "a".repeat(40))).toBe(true);
    expect(isValidAddress("0x" + "A1b2".repeat(10))).toBe(true);
  });

  it("rejects wrong length / missing prefix / non-hex", () => {
    expect(isValidAddress("0x" + "a".repeat(39))).toBe(false);
    expect(isValidAddress("a".repeat(42))).toBe(false);
    expect(isValidAddress("0x" + "z".repeat(40))).toBe(false);
    expect(isValidAddress(null as unknown)).toBe(false);
  });
});

describe("isValidRequestId", () => {
  it("accepts 8-64 url-safe chars", () => {
    expect(isValidRequestId(crypto.randomUUID())).toBe(true);
    expect(isValidRequestId("abcd1234")).toBe(true);
  });
  it("rejects too short / illegal chars", () => {
    expect(isValidRequestId("short")).toBe(false);
    expect(isValidRequestId("has space yes")).toBe(false);
    expect(isValidRequestId("a".repeat(65))).toBe(false);
  });
});

describe("isValidInquiryId", () => {
  it("accepts inq_ ids and rejects others", () => {
    expect(isValidInquiryId("inq_ABC123")).toBe(true);
    expect(isValidInquiryId("ABC123")).toBe(false);
    expect(isValidInquiryId("inq_")).toBe(false);
  });
});
