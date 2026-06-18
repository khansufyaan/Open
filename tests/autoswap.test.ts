import { describe, expect, it } from "vitest";

import {
  isSupportedTarget,
  setAutoSwapTarget,
  ACCEPTED_DEPOSIT_CURRENCIES,
  SUPPORTED_TARGET_CURRENCIES,
} from "@/lib/bridge/autoswap";
import type { UserRecord } from "@/types/user";

// No Bridge configured in tests → setAutoSwapTarget uses demo addresses.

describe("isSupportedTarget", () => {
  it("accepts configured targets (case-insensitive) and rejects others", () => {
    expect(isSupportedTarget("usdc")).toBe(true);
    expect(isSupportedTarget("USDC")).toBe(true);
    expect(isSupportedTarget("eth")).toBe(false);
  });
});

describe("setAutoSwapTarget (demo)", () => {
  const baseUser: UserRecord = {
    userId: "did:test:autoswap",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it("provisions a demo address for every accepted coin except the target", async () => {
    const { config } = await setAutoSwapTarget(baseUser, "usdc");
    expect(config.targetCurrency).toBe("usdc");
    expect(config.source).toBe("demo");

    const expected = ACCEPTED_DEPOSIT_CURRENCIES.filter((c) => c !== "usdc");
    expect(config.addresses).toHaveLength(expected.length);
    expect(config.addresses.map((a) => a.currency).sort()).toEqual([...expected].sort());

    // Every generated address converts to the chosen target.
    for (const a of config.addresses) {
      expect(a.destinationCurrency).toBe("usdc");
      expect(a.address).toMatch(/^0x[a-f0-9]{40}$/);
      expect(a.currency).not.toBe("usdc"); // never same-coin
    }
  });

  it("is deterministic for the same user+coin", async () => {
    const a = await setAutoSwapTarget(baseUser, "usdt");
    const b = await setAutoSwapTarget(baseUser, "usdt");
    expect(a.config.addresses.map((x) => x.address)).toEqual(
      b.config.addresses.map((x) => x.address)
    );
  });

  it("only exposes supported targets", () => {
    expect(SUPPORTED_TARGET_CURRENCIES).toContain("usdc");
  });
});
