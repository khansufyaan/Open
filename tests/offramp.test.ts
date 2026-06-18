import { describe, expect, it } from "vitest";

import { linkBankAccount, burnToFiat } from "@/lib/bridge/offramp";
import {
  isValidRoutingNumber,
  isValidAccountNumber,
  last4,
} from "@/lib/validation";
import type { UserRecord } from "@/types/user";

describe("bank-detail validation", () => {
  it("routing number is exactly 9 digits", () => {
    expect(isValidRoutingNumber("123456789")).toBe(true);
    expect(isValidRoutingNumber("12345678")).toBe(false);
    expect(isValidRoutingNumber("1234567890")).toBe(false);
    expect(isValidRoutingNumber("12345678a")).toBe(false);
  });

  it("account number is 4–17 digits", () => {
    expect(isValidAccountNumber("1234")).toBe(true);
    expect(isValidAccountNumber("12345678901234567")).toBe(true);
    expect(isValidAccountNumber("123")).toBe(false);
    expect(isValidAccountNumber("123456789012345678")).toBe(false);
  });

  it("last4 returns the trailing four chars", () => {
    expect(last4("000123456789")).toBe("6789");
  });
});

describe("offramp (demo, no Bridge)", () => {
  const user: UserRecord = {
    userId: "did:test:offramp",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    onboardingCompleted: true,
  };

  it("links a demo bank account with the right last4", async () => {
    const account = await linkBankAccount(user, {
      accountHolder: "Jane Doe",
      accountNumber: "000123456789",
      routingNumber: "123456789",
      bankName: "Chase",
    });
    expect(account.source).toBe("demo");
    expect(account.last4).toBe("6789");
    expect(account.bankName).toBe("Chase");
  });

  it("burns to a demo withdraw transaction", async () => {
    const result = await burnToFiat(user, { currency: "usdc", amount: "25" });
    expect(result.demo).toBe(true);
    expect(result.transaction.direction).toBe("withdraw");
    expect(result.transaction.currency).toBe("USDC");
    expect(result.transaction.amount).toBe("25");
  });
});
