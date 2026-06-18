import { createHash } from "crypto";

import {
  createLiquidationAddress,
  listLiquidationAddresses,
  isBridgeConfigured,
  type BridgeLiquidationAddress,
} from "@/lib/bridge/server";
import { updateUser } from "@/lib/db/store";
import { captureError } from "@/lib/observability";
import type { AutoSwapConfig, LiquidationDepositAddress, UserRecord } from "@/types/user";

/**
 * Auto-convert-on-deposit via Bridge liquidation addresses.
 *
 * The user picks a target stablecoin. For every *other* accepted stablecoin we
 * provision a liquidation address that auto-converts deposits to the target and
 * forwards them into the user's Bridge wallet — no per-deposit approval. The
 * target coin itself is received directly on the wallet address (no conversion
 * needed), so it's excluded here.
 */

const CHAIN = process.env.BRIDGE_DEFAULT_CHAIN ?? "base";

/** Stablecoins a user may pick as their target (the app default is first). */
export const SUPPORTED_TARGET_CURRENCIES = ["usdc", "usdt", "pyusd", "dai"];
/** Stablecoins we accept on deposit and auto-convert from. */
export const ACCEPTED_DEPOSIT_CURRENCIES = ["usdc", "usdt", "pyusd", "dai"];

export function isSupportedTarget(currency: string): boolean {
  return SUPPORTED_TARGET_CURRENCIES.includes(currency.toLowerCase());
}

function mapAddress(
  source: string,
  destination: string,
  res: BridgeLiquidationAddress
): LiquidationDepositAddress {
  return {
    id: res.id,
    address: res.address ?? "",
    chain: res.chain ?? CHAIN,
    currency: (res.currency ?? source).toLowerCase(),
    destinationCurrency: (res.destination_currency ?? destination).toLowerCase(),
    source: "bridge",
  };
}

/** Deterministic, clearly-fake address so the UX is visible without Bridge. */
function demoAddress(userId: string, currency: string): LiquidationDepositAddress {
  const hash = createHash("sha256").update(`liq:${userId}:${currency}`).digest("hex");
  return {
    id: `demo_liq_${currency}_${userId.slice(-6)}`,
    address: `0x${hash.slice(0, 40)}`,
    chain: CHAIN,
    currency,
    destinationCurrency: "", // filled by caller
    source: "demo",
  };
}

export type SetAutoSwapResult = { config: AutoSwapConfig; note?: string };

/**
 * Sets the user's target stablecoin and (re)provisions liquidation addresses
 * for every other accepted coin. Real Bridge addresses when possible; otherwise
 * clearly-labeled demo addresses so the flow is testable.
 */
export async function setAutoSwapTarget(
  user: UserRecord,
  rawTarget: string
): Promise<SetAutoSwapResult> {
  const target = rawTarget.toLowerCase();
  const sources = ACCEPTED_DEPOSIT_CURRENCIES.filter((c) => c !== target);
  const now = new Date().toISOString();

  // Demo when Bridge isn't usable for this user.
  if (!isBridgeConfigured() || !user.bridgeCustomerId || !user.bridgeWalletId) {
    const addresses = sources.map((c) => ({ ...demoAddress(user.userId, c), destinationCurrency: target }));
    const config: AutoSwapConfig = { targetCurrency: target, chain: CHAIN, addresses, source: "demo", updatedAt: now };
    await updateUser(user.userId, { autoSwap: config });
    return {
      config,
      note: isBridgeConfigured()
        ? "Finish onboarding to activate real auto-convert deposit addresses."
        : "Demo addresses — set a Bridge API key to activate real auto-convert.",
    };
  }

  try {
    // Reuse any existing liquidation addresses (Bridge dedupes via idempotency
    // key too) so repeated calls don't pile up addresses.
    let existing: BridgeLiquidationAddress[] = [];
    try {
      existing = await listLiquidationAddresses(user.bridgeCustomerId);
    } catch (listError) {
      captureError("AutoSwap.list", listError, { userId: user.userId });
    }

    const addresses: LiquidationDepositAddress[] = [];
    for (const currency of sources) {
      const found = existing.find(
        (a) =>
          a.currency?.toLowerCase() === currency &&
          a.destination_currency?.toLowerCase() === target &&
          (a.chain ?? CHAIN).toLowerCase() === CHAIN
      );
      if (found?.address) {
        addresses.push(mapAddress(currency, target, found));
        continue;
      }
      const created = await createLiquidationAddress({
        customerId: user.bridgeCustomerId,
        chain: CHAIN,
        currency,
        destinationCurrency: target,
        destinationPaymentRail: CHAIN,
        destinationBridgeWalletId: user.bridgeWalletId,
        idempotencyKey: `liq-${user.userId}-${CHAIN}-${currency}-${target}`,
      });
      addresses.push(mapAddress(currency, target, created));
    }

    const config: AutoSwapConfig = { targetCurrency: target, chain: CHAIN, addresses, source: "bridge", updatedAt: now };
    await updateUser(user.userId, { autoSwap: config });
    return { config };
  } catch (error) {
    captureError("AutoSwap.set", error, { userId: user.userId, target });
    // Fall back to demo addresses so the UI still works, with a clear note.
    const addresses = sources.map((c) => ({ ...demoAddress(user.userId, c), destinationCurrency: target }));
    const config: AutoSwapConfig = { targetCurrency: target, chain: CHAIN, addresses, source: "demo", updatedAt: now };
    await updateUser(user.userId, { autoSwap: config });
    return { config, note: "Showing demo addresses — Bridge liquidation addresses aren't enabled on your account yet." };
  }
}
