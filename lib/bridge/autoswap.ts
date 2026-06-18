import {
  getWallet,
  createTransfer,
  isBridgeConfigured,
  type BridgeWalletBalance,
} from "@/lib/bridge/server";
import { updateUser } from "@/lib/db/store";
import { recordAudit } from "@/lib/audit";
import { captureError } from "@/lib/observability";
import type { AutoSwapConfig, UserRecord } from "@/types/user";

/**
 * Auto-convert deposits — single-address model.
 *
 * The user has ONE wallet address (the receiver everyone sends to) and picks
 * ONE target stablecoin. Whenever a *different* stablecoin lands in that wallet,
 * we automatically convert it to the target via a Bridge transfer (same wallet,
 * source currency -> target currency) with no approval. So the user only ever
 * sees their chosen coin.
 */

const CHAIN = process.env.BRIDGE_DEFAULT_CHAIN ?? "base";

/** Stablecoins a user may pick as their target (the app default is first). */
export const SUPPORTED_TARGET_CURRENCIES = ["usdc", "usdt", "pyusd", "dai"];

export function isSupportedTarget(currency: string): boolean {
  return SUPPORTED_TARGET_CURRENCIES.includes(currency.toLowerCase());
}

/**
 * Given wallet balances and a target, returns the non-target balances that
 * should be converted (positive amount, different currency). Pure + tested.
 */
export function balancesToSweep(
  balances: BridgeWalletBalance[] | undefined,
  target: string
): BridgeWalletBalance[] {
  const t = target.toLowerCase();
  return (balances ?? []).filter(
    (b) => b.currency?.toLowerCase() !== t && parseFloat(b.balance || "0") > 0
  );
}

/** Sets the user's chosen target stablecoin. */
export async function setAutoSwapTarget(
  user: UserRecord,
  rawTarget: string
): Promise<AutoSwapConfig> {
  const target = rawTarget.toLowerCase();
  const config: AutoSwapConfig = {
    targetCurrency: target,
    chain: CHAIN,
    source: isBridgeConfigured() && user.bridgeWalletId ? "bridge" : "demo",
    updatedAt: new Date().toISOString(),
    lastSweepAt: user.autoSwap?.lastSweepAt,
  };
  await updateUser(user.userId, { autoSwap: config });
  return config;
}

/**
 * Converts any non-target stablecoin balance in the user's wallet to their
 * target coin. Best-effort and idempotent (keyed by currency+amount so repeated
 * calls before settlement dedupe at Bridge). Returns the number of conversions
 * initiated. Never throws.
 */
export async function sweepToTarget(
  user: UserRecord,
  balances?: BridgeWalletBalance[]
): Promise<number> {
  const target = user.autoSwap?.targetCurrency;
  if (
    !target ||
    !isBridgeConfigured() ||
    !user.bridgeCustomerId ||
    !user.bridgeWalletId
  ) {
    return 0;
  }

  try {
    // Read fresh balances if not supplied.
    let list = balances;
    if (!list) {
      const wallet = await getWallet(user.bridgeCustomerId, user.bridgeWalletId);
      list = wallet.balances;
    }

    const toConvert = balancesToSweep(list, target);
    if (toConvert.length === 0) return 0;

    let converted = 0;
    for (const b of toConvert) {
      const currency = b.currency.toLowerCase();
      try {
        await createTransfer({
          amount: b.balance,
          onBehalfOf: user.bridgeCustomerId,
          // Same wallet in and out — this performs the currency conversion.
          idempotencyKey: `sweep-${user.userId}-${currency}-${b.balance}`,
          source: { payment_rail: CHAIN, currency, bridge_wallet_id: user.bridgeWalletId },
          destination: { payment_rail: CHAIN, currency: target, bridge_wallet_id: user.bridgeWalletId },
        });
        converted += 1;
        await recordAudit({
          userId: user.userId,
          action: "autoswap.converted",
          detail: { from: currency, to: target, amount: b.balance },
        });
      } catch (transferError) {
        captureError("AutoSwap.sweep.transfer", transferError, {
          userId: user.userId,
          from: currency,
          to: target,
        });
      }
    }

    if (converted > 0) {
      await updateUser(user.userId, {
        autoSwap: {
          targetCurrency: target,
          chain: CHAIN,
          source: "bridge",
          updatedAt: user.autoSwap?.updatedAt ?? new Date().toISOString(),
          lastSweepAt: new Date().toISOString(),
        },
      });
    }
    return converted;
  } catch (error) {
    captureError("AutoSwap.sweep", error, { userId: user.userId });
    return 0;
  }
}
