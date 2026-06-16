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
import { enforceRateLimit } from "@/lib/ratelimit";
import { recordAudit } from "@/lib/audit";
import { captureError } from "@/lib/observability";
import { isValidAmount, isValidAddress, isValidRequestId } from "@/lib/validation";
import type { TransactionRecord } from "@/types/user";

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

  const limited = await enforceRateLimit("send", userId);
  if (limited) return limited;

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const { amount, toAddress, requestId } = (body ?? {}) as {
    amount?: string;
    toAddress?: string;
    requestId?: string;
  };

  // A valid client requestId makes the transfer idempotent; otherwise fall back
  // to a server-generated id (no cross-request dedupe, but still well-formed).
  const idemId = isValidRequestId(requestId) ? requestId : randomUUID();

  if (!isValidAmount(amount)) {
    return NextResponse.json(
      { error: "INVALID_AMOUNT", message: "Enter a valid amount." },
      { status: 400 }
    );
  }

  if (!isValidAddress(toAddress)) {
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

  // Atomically prepend the transaction so concurrent writers can't clobber it.
  const recordTransaction = async (tx: TransactionRecord) => {
    await updateUser(userId, (current) => ({
      transactions: [tx, ...(current?.transactions ?? [])].slice(0, 50),
    }));
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
    await recordAudit({
      userId,
      action: "send.demo_submitted",
      detail: { amount: cleanAmount, currency: currency.toUpperCase(), to: cleanAddress },
    });
    return NextResponse.json({ success: true, demo: true, transaction: tx });
  }

  try {
    const transfer = await createTransfer({
      amount: cleanAmount,
      onBehalfOf: user.bridgeCustomerId,
      idempotencyKey: `send-${userId}-${idemId}`,
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
    await recordAudit({
      userId,
      action: "send.submitted",
      detail: {
        transferId: transfer.id,
        amount: cleanAmount,
        currency: currency.toUpperCase(),
        to: cleanAddress,
        state: transfer.state,
      },
    });

    return NextResponse.json({ success: true, transaction: tx });
  } catch (error) {
    if (error instanceof BridgeRequestError) {
      return handleBridgeError(error, "Send");
    }
    captureError("Send", error, { userId });
    return NextResponse.json(
      { error: "SEND_FAILED", message: "Unable to send funds." },
      { status: 500 }
    );
  }
}
