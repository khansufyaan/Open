import { describe, expect, it } from "vitest";

import {
  isSupportedTarget,
  setAutoSwapTarget,
  balancesToSweep,
  SUPPORTED_TARGET_CURRENCIES,
} from "@/lib/bridge/autoswap";
import type { UserRecord } from "@/types/user";

describe("isSupportedTarget", () => {
  it("accepts configured targets (case-insensitive) and rejects others", () => {
    expect(isSupportedTarget("usdc")).toBe(true);
    expect(isSupportedTarget("USDC")).toBe(true);
    expect(isSupportedTarget("eth")).toBe(false);
  });

  it("exposes USDC as a supported target", () => {
    expect(SUPPORTED_TARGET_CURRENCIES).toContain("usdc");
  });
});

describe("balancesToSweep", () => {
  it("returns only positive, non-target balances", () => {
    const balances = [
      { currency: "USDC", balance: "10" }, // target → skip
      { currency: "USDT", balance: "5" }, // convert
      { currency: "DAI", balance: "0" }, // zero → skip
      { currency: "PYUSD", balance: "2.5" }, // convert
    ];
    const result = balancesToSweep(balances, "usdc");
    expect(result.map((b) => b.currency).sort()).toEqual(["PYUSD", "USDT"]);
  });

  it("is empty when only the target is held", () => {
    expect(balancesToSweep([{ currency: "usdc", balance: "100" }], "usdc")).toHaveLength(0);
  });

  it("handles undefined balances", () => {
    expect(balancesToSweep(undefined, "usdc")).toEqual([]);
  });
});

describe("setAutoSwapTarget (demo, no Bridge)", () => {
  const baseUser: UserRecord = {
    userId: "did:test:autoswap",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it("stores the chosen target and marks it demo without Bridge", async () => {
    const config = await setAutoSwapTarget(baseUser, "USDC");
    expect(config.targetCurrency).toBe("usdc");
    expect(config.source).toBe("demo");
    expect(config.chain).toBeTruthy();
  });
});
