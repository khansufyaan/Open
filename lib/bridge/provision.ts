import { createHash } from "crypto";

import {
  createWallet,
  createVirtualAccount,
  isBridgeConfigured,
  type BridgeVirtualAccount,
} from "@/lib/bridge/server";
import { updateUser } from "@/lib/db/store";
import type { UserRecord, VirtualAccountDetails } from "@/types/user";

/**
 * Ensures a verified user has a Bridge custodial wallet and a Bridge virtual
 * account (US bank account + routing number). Idempotent: only provisions the
 * pieces that are missing. When Bridge is not configured it synthesizes
 * deterministic demo values so the portal UX is fully testable.
 */

function mapVirtualAccount(va: BridgeVirtualAccount): VirtualAccountDetails {
  const d = va.source_deposit_instructions ?? {};
  return {
    accountNumber: d.bank_account_number ?? d.account_number ?? "",
    routingNumber: d.bank_routing_number ?? d.routing_number ?? "",
    bankName: d.bank_name ?? null,
    beneficiaryName: d.bank_beneficiary_name ?? null,
    bankAddress: d.bank_address ?? null,
    paymentRails: d.payment_rails ?? (d.payment_rail ? [d.payment_rail] : []),
  };
}

function deterministicDigits(seed: string, length: number): string {
  const hash = createHash("sha256").update(seed).digest("hex");
  let digits = "";
  for (const char of hash) {
    digits += (parseInt(char, 16) % 10).toString();
    if (digits.length >= length) break;
  }
  return digits.slice(0, length);
}

function demoWalletAddress(userId: string): string {
  return "0x" + createHash("sha256").update(`wallet:${userId}`).digest("hex").slice(0, 40);
}

function demoVirtualAccount(userId: string): VirtualAccountDetails {
  return {
    accountNumber: deterministicDigits(`acct:${userId}`, 10),
    routingNumber: "021000021", // demo ABA (JPMorgan Chase)
    bankName: "Blue Wallet Demo Bank",
    beneficiaryName: "Blue Wallet User",
    bankAddress: "270 Park Avenue, New York, NY 10017",
    paymentRails: ["ach", "wire"],
  };
}

/**
 * Provisions a demo wallet + virtual account (clearly labeled) without any
 * identity verification. Used when a user skips onboarding so testers can see
 * the full dashboard. A later real KYC upgrades these to real Bridge resources.
 */
export async function provisionDemo(user: UserRecord): Promise<UserRecord> {
  let next = user;
  if (!next.walletAddress) {
    next = await updateUser(next.userId, {
      walletAddress: demoWalletAddress(next.userId),
      walletChain: process.env.BRIDGE_DEFAULT_CHAIN ?? "base",
      provisionSource: "demo",
    });
  }
  if (!next.virtualAccount) {
    next = await updateUser(next.userId, {
      virtualAccount: demoVirtualAccount(next.userId),
      provisionSource: "demo",
    });
  }
  if (!next.onboardingCompleted) {
    next = await updateUser(next.userId, { onboardingCompleted: true });
  }
  return next;
}

export async function ensureProvisioned(user: UserRecord): Promise<UserRecord> {
  // Only provision once identity is verified.
  if (!user.personaVerificationCompleted) {
    return user;
  }

  let next = user;

  // --- Demo provisioning (no Bridge credentials) ---
  if (!isBridgeConfigured()) {
    return provisionDemo(next);
  }

  // --- Real Bridge provisioning ---
  const customerId = next.bridgeCustomerId;
  if (!customerId) {
    // We can't provision without a Bridge customer (set during KYC approval).
    return next;
  }

  // Real wallet (a demo skip only set walletAddress, never bridgeWalletId).
  if (!next.bridgeWalletId) {
    const wallet = await createWallet({
      customerId,
      idempotencyKey: `wallet-${next.userId}`,
    });
    next = await updateUser(next.userId, {
      bridgeWalletId: wallet.id,
      walletAddress: wallet.address,
      walletChain: wallet.chain,
      provisionSource: "bridge",
    });
  }

  // Real virtual account (a demo skip set virtualAccount but no virtualAccountId).
  if (!next.virtualAccountId) {
    // A virtual account requires the feature to be enabled on the Bridge
    // account. If it isn't, don't block onboarding — the wallet still works for
    // on-chain send/receive and the bank details show as pending.
    try {
      const va = await createVirtualAccount({
        customerId,
        walletId: next.bridgeWalletId,
        idempotencyKey: `va-${next.userId}`,
      });
      next = await updateUser(next.userId, {
        virtualAccountId: va.id,
        virtualAccount: mapVirtualAccount(va),
        provisionSource: "bridge",
      });
    } catch (error) {
      console.error("[Provision] Virtual account creation failed (continuing):", error);
    }
  }

  // Onboarding is complete once the wallet exists, even if the virtual account
  // is still pending.
  if (next.walletAddress && !next.onboardingCompleted) {
    next = await updateUser(next.userId, { onboardingCompleted: true });
  }

  return next;
}
