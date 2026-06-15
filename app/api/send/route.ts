import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { getUser, updateUser } from "@/lib/db/store";
import { requireAuth } from "@/lib/auth/privy";
import {
  createTransfer,
  getTransferTxHash,
  isBridgeConfigured,
  BridgeRequestError,
} from "@/lib/bridge/server";
import { handleBridgeError } from "@/lib/bridge/route-helpers";
import type { TransactionRecord } from "@/types/user";

const HEX_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const AMOUNT_REGEX = /^\d+(\.\d{1,6})?$/;

/**
 * Sends USDC from the user's Bridge custodial wallet to an external on-chain
 * address. Bridge custodies the keys and broadcasts; we record the activity.
 */
export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }
  const userId = auth.userId;

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const { amount, toAddress } = (body ?? {}) as { amount?: string; toAddress?: string };

  if (typeof amount !== "string" || !AMOUNT_REGEX.test(amount.trim()) || parseFloat(amount) <= 0) {
    return NextResponse.json(
      { error: "INVALID_AMOUNT", message: "Enter a valid amount." },
      { status: 400 }
    );
  }

  if (typeof toAddress !== "string" || !HEX_ADDRESS_REGEX.test(toAddress.trim())) {
    return NextResponse.json(
      { error: "INVALID_ADDRESS", message: "Enter a valid destination address (0x…)." },
      { status: 400 }
    );
  }

  const user = await getUser(userId);
  if (!user || !user.onboardingCompleted || !user.walletAddress) {
    return NextResponse.json(
      { error: "NOT_ONBOARDED", message: "Finish onboarding before sending." },
      { status: 409 }
    );
  }

  const cleanAmount = amount.trim();
  const cleanAddress = toAddress.trim();
  const chain = user.walletChain ?? process.env.BRIDGE_DEFAULT_CHAIN ?? "base";
  const currency = process.env.BRIDGE_TRANSFER_CURRENCY ?? "usdc";
  const timestamp = new Date().toISOString();

  const recordTransaction = async (tx: TransactionRecord) => {
    const transactions = [tx, ...(user.transactions ?? [])].slice(0, 50);
    await updateUser(userId, { transactions });
  };

  // --- Demo mode: synthesize a transfer so the UX is testable ---
  if (!isBridgeConfigured() || !user.bridgeCustomerId || !user.bridgeWalletId) {
    const tx: TransactionRecord = {
      id: randomUUID(),
      direction: "send",
      amount: cleanAmount,
      currency: currency.toUpperCase(),
      counterparty: cleanAddress,
      status: "demo_submitted",
      txHash: null,
      createdAt: timestamp,
    };
    await recordTransaction(tx);
    return NextResponse.json({ success: true, demo: true, transaction: tx });
  }

  try {
    const transfer = await createTransfer({
      amount: cleanAmount,
      onBehalfOf: user.bridgeCustomerId,
      idempotencyKey: `send-${userId}-${randomUUID()}`,
      source: {
        payment_rail: chain,
        currency,
        bridge_wallet_id: user.bridgeWalletId,
      },
      destination: {
        payment_rail: chain,
        currency,
        to_address: cleanAddress,
      },
    });

    const tx: TransactionRecord = {
      id: transfer.id,
      direction: "send",
      amount: cleanAmount,
      currency: currency.toUpperCase(),
      counterparty: cleanAddress,
      status: transfer.state,
      txHash: getTransferTxHash(transfer),
      createdAt: timestamp,
    };
    await recordTransaction(tx);

    return NextResponse.json({ success: true, transaction: tx });
  } catch (error) {
    if (error instanceof BridgeRequestError) {
      return handleBridgeError(error, "Send");
    }
    console.error("[Send] Failed to create transfer:", error);
    return NextResponse.json(
      { error: "SEND_FAILED", message: "Unable to send funds." },
      { status: 500 }
    );
  }
}
