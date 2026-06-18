import { NextResponse } from "next/server";

import { getUser, updateUser } from "@/lib/db/store";
import { ensureProvisioned } from "@/lib/bridge/provision";
import { requireAuth, getPrivyEmail } from "@/lib/auth/privy";
import {
  getWallet,
  getWalletBalanceForCurrency,
  isBridgeConfigured,
} from "@/lib/bridge/server";
import { SUPPORTED_TARGET_CURRENCIES, sweepToTarget } from "@/lib/bridge/autoswap";
import type { UserRecord } from "@/types/user";

/**
 * Single source of truth for the portal. Upserts the signed-in user, drives
 * provisioning when KYC is done, and returns everything the dashboard renders:
 * onboarding state, wallet (address + balance), virtual account, transactions.
 */
export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }
  const userId = auth.userId;

  try {
    const existing = await getUser(userId);
    const email = (await getPrivyEmail(userId)) ?? existing?.email;

    let user: UserRecord = await updateUser(userId, {
      ...(email ? { email } : {}),
      signInCompleted: true,
    });

    // If verified but not fully provisioned, finish provisioning idempotently.
    if (user.personaVerificationCompleted && !user.onboardingCompleted) {
      try {
        user = await ensureProvisioned(user);
      } catch (error) {
        console.error("[Portal] Provisioning failed:", error);
      }
    }

    // The displayed coin is the user's auto-convert target (default USDC), so
    // they only ever see their chosen stablecoin.
    const target = (
      user.autoSwap?.targetCurrency ??
      process.env.BRIDGE_TRANSFER_CURRENCY ??
      "usdc"
    ).toLowerCase();
    const currency = target.toUpperCase();

    // Live balance from Bridge when configured; demo wallets report 0.
    let balance = "0";
    if (isBridgeConfigured() && user.bridgeCustomerId && user.bridgeWalletId) {
      try {
        const wallet = await getWallet(user.bridgeCustomerId, user.bridgeWalletId);
        // Auto-convert any non-target stablecoin that has landed, then report
        // the target balance (best-effort; never blocks the response on error).
        if (user.autoSwap?.targetCurrency) {
          await sweepToTarget(user, wallet.balances);
        }
        balance = getWalletBalanceForCurrency(wallet, target);
      } catch (error) {
        console.error("[Portal] Failed to read wallet balance:", error);
      }
    }

    return NextResponse.json({
      user: {
        userId: user.userId,
        email: user.email ?? null,
        fullName: user.fullName ?? null,
      },
      onboarding: {
        signedIn: true,
        kycStatus: user.kycStatus ?? "not_started",
        kycCompleted: Boolean(user.personaVerificationCompleted),
        onboardingCompleted: Boolean(user.onboardingCompleted),
        skipped: Boolean(user.skippedOnboarding),
        provisionSource: user.provisionSource ?? null,
      },
      wallet: user.walletAddress
        ? {
            address: user.walletAddress,
            chain: user.walletChain ?? process.env.BRIDGE_DEFAULT_CHAIN ?? "base",
            balance,
            currency,
          }
        : null,
      virtualAccount: user.virtualAccount ?? null,
      card: user.card ?? null,
      autoSwap: user.autoSwap ?? null,
      supportedTargets: SUPPORTED_TARGET_CURRENCIES,
      transactions: user.transactions ?? [],
    });
  } catch (error) {
    console.error("[Portal] Failed to load portal:", error);
    return NextResponse.json(
      {
        error: "PORTAL_FAILED",
        message: error instanceof Error ? error.message : "Unable to load your portal.",
      },
      { status: 500 }
    );
  }
}
