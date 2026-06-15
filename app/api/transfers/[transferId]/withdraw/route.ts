import { NextResponse } from "next/server";
import { ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

import {
  createTransfer,
  getTransferTxHash,
  isBridgeConfigured,
  BridgeRequestError,
} from "@/lib/bridge/server";
import { handleBridgeError } from "@/lib/bridge/route-helpers";
import { docClient, TRANSFERS_TABLE } from "@/lib/db/dynamo";
import { requireAuth } from "@/lib/auth/privy";
import { userOwnsRecipientKey } from "@/lib/auth/authorize";

const TRANSFER_RAIL = process.env.BRIDGE_DEFAULT_CHAIN ?? "base";
const TRANSFER_CURRENCY = process.env.BRIDGE_TRANSFER_CURRENCY ?? "usdc";

type TransferRecord = {
  transferId: string;
  recipientKey: string;
  recipientRouting: string;
  recipientAccount: string;
  amount: string;
  amountCents: number;
  status: "DEPOSITED" | "PENDING" | "FAILED" | "WITHDRAWN";
  withdrawalTxHash?: string;
  withdrawalTargetAddress?: string;
  withdrawnAt?: string;
  depositAddress?: string;
};

function normalizeAddress(address: string): string {
  return address.trim();
}

function isHexAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isValidAmount(amount: string): boolean {
  // USDC has 6 decimals; reject trailing dots, scientific notation, and excess precision.
  return /^\d+(\.\d{1,6})?$/.test(amount) && Number(amount) > 0;
}

async function findTransferById(transferId: string): Promise<TransferRecord | null> {
  const response = await docClient.send(
    new ScanCommand({
      TableName: TRANSFERS_TABLE,
      FilterExpression: "transferId = :transferId",
      ExpressionAttributeValues: { ":transferId": transferId },
    })
  );

  const record = response.Items?.[0] as TransferRecord | undefined;
  return record ?? null;
}

type RouteParams = { transferId: string };
type RouteContext = { params: Promise<RouteParams> | RouteParams };

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  if (!isBridgeConfigured()) {
    return NextResponse.json(
      { error: "BRIDGE_NOT_CONFIGURED", message: "Bridge API key is missing on the server." },
      { status: 500 }
    );
  }

  const companyCustomerId = process.env.BRIDGE_COMPANY_CUSTOMER_ID;

  if (!companyCustomerId) {
    return NextResponse.json(
      {
        error: "COMPANY_WALLET_NOT_CONFIGURED",
        message: "Set BRIDGE_COMPANY_CUSTOMER_ID for the company Bridge customer.",
      },
      { status: 500 }
    );
  }

  const resolvedParams = await Promise.resolve(context.params);
  const { transferId } = resolvedParams ?? {};

  if (!transferId) {
    return NextResponse.json(
      { error: "MISSING_TRANSFER_ID", message: "transferId parameter is required." },
      { status: 400 }
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON", message: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const targetAddressInput =
    typeof body === "object" && body && "targetAddress" in body
      ? normalizeAddress(String((body as { targetAddress?: unknown }).targetAddress ?? ""))
      : "";

  if (!isHexAddress(targetAddressInput)) {
    return NextResponse.json(
      { error: "INVALID_TARGET_ADDRESS", message: "A valid Base wallet address (0x...) is required." },
      { status: 400 }
    );
  }

  const record = await findTransferById(transferId);

  if (!record) {
    return NextResponse.json(
      { error: "TRANSFER_NOT_FOUND", message: "No transfer record matches the supplied transferId." },
      { status: 404 }
    );
  }

  if (!(await userOwnsRecipientKey(auth.userId, record.recipientKey))) {
    // Return 404 (not 403) so a non-owner can't probe which transferIds exist.
    return NextResponse.json(
      { error: "TRANSFER_NOT_FOUND", message: "No transfer record matches the supplied transferId." },
      { status: 404 }
    );
  }

  if (record.status === "WITHDRAWN") {
    return NextResponse.json(
      { error: "ALREADY_WITHDRAWN", message: "This transfer has already been withdrawn." },
      { status: 409 }
    );
  }

  if (record.status !== "DEPOSITED") {
    return NextResponse.json(
      {
        error: "TRANSFER_NOT_READY",
        message: `Transfer status must be DEPOSITED to withdraw (current: ${record.status}).`,
      },
      { status: 409 }
    );
  }

  if (!isValidAmount(record.amount)) {
    return NextResponse.json(
      { error: "INVALID_AMOUNT", message: "Transfer amount must be a positive decimal." },
      { status: 400 }
    );
  }

  // Funds are held in the company vault. A Bridge transfer obscures the source
  // address on-chain, so we send directly from the vault to the recipient's
  // external address — no intermediate per-recipient wallet or claim step.
  const sourceWalletId = process.env.BRIDGE_COMPANY_WALLET_ID;

  if (!sourceWalletId) {
    return NextResponse.json(
      {
        error: "COMPANY_WALLET_NOT_CONFIGURED",
        message: "Set BRIDGE_COMPANY_WALLET_ID for the company vault wallet.",
      },
      { status: 500 }
    );
  }

  try {
    // Bridge custodies the wallet keys and broadcasts the on-chain transfer.
    const transfer = await createTransfer({
      amount: record.amount,
      onBehalfOf: companyCustomerId,
      idempotencyKey: `withdraw:${record.transferId}`,
      source: {
        payment_rail: TRANSFER_RAIL,
        currency: TRANSFER_CURRENCY,
        bridge_wallet_id: sourceWalletId,
      },
      destination: {
        payment_rail: TRANSFER_RAIL,
        currency: TRANSFER_CURRENCY,
        to_address: targetAddressInput,
      },
    });

    // Bridge transfers are async: store the on-chain hash only when present
    // (null otherwise) so Basescan links never 404. The Bridge transfer id is
    // persisted separately for reconciliation.
    const onchainHash = getTransferTxHash(transfer);
    const timestamp = new Date().toISOString();

    await docClient.send(
      new UpdateCommand({
        TableName: TRANSFERS_TABLE,
        Key: {
          recipientKey: record.recipientKey,
          transferId: record.transferId,
        },
        UpdateExpression:
          "SET #status = :withdrawn, withdrawalTxHash = :txHash, bridgeWithdrawTransferId = :bridgeId, withdrawalTargetAddress = :targetAddress, withdrawnAt = :withdrawnAt, updatedAt = :updatedAt",
        ConditionExpression: "#status = :deposited",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":withdrawn": "WITHDRAWN",
          ":deposited": "DEPOSITED",
          ":txHash": onchainHash ?? null,
          ":bridgeId": transfer.id,
          ":targetAddress": targetAddressInput,
          ":withdrawnAt": timestamp,
          ":updatedAt": timestamp,
        },
      })
    );

    return NextResponse.json({
      success: true,
      txHash: onchainHash,
      bridgeTransferId: transfer.id,
      state: transfer.state,
      pending: !onchainHash,
    });
  } catch (error) {
    console.error("Transfer withdrawal failed:", error);

    if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
      return NextResponse.json(
        {
          error: "ALREADY_WITHDRAWN",
          message: "This transfer has already been withdrawn by another request.",
        },
        { status: 409 }
      );
    }

    if (error instanceof BridgeRequestError) {
      return handleBridgeError(error, "Withdrawal");
    }

    return NextResponse.json(
      {
        error: "WITHDRAWAL_FAILED",
        message: error instanceof Error ? error.message : "Failed to broadcast withdrawal transfer.",
      },
      { status: 500 }
    );
  }
}

/**
 * Lightweight withdrawal quote. Bridge sponsors gas and custodies the source
 * wallet, so there is no user gas top-up to compute — this simply confirms the
 * transfer is in a withdrawable state and echoes the amount.
 */
export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const resolvedParams = await Promise.resolve(context.params);
  const { transferId } = resolvedParams ?? {};

  if (!transferId) {
    return NextResponse.json(
      { error: "MISSING_TRANSFER_ID", message: "transferId parameter is required." },
      { status: 400 }
    );
  }

  const targetAddressInput = normalizeAddress(
    new URL(request.url).searchParams.get("targetAddress") ?? ""
  );

  if (!isHexAddress(targetAddressInput)) {
    return NextResponse.json(
      { error: "INVALID_TARGET_ADDRESS", message: "A valid Base wallet address (0x...) is required." },
      { status: 400 }
    );
  }

  const record = await findTransferById(transferId);

  if (!record) {
    return NextResponse.json(
      { error: "TRANSFER_NOT_FOUND", message: "No transfer record matches the supplied transferId." },
      { status: 404 }
    );
  }

  if (!(await userOwnsRecipientKey(auth.userId, record.recipientKey))) {
    // Return 404 (not 403) so a non-owner can't probe which transferIds exist.
    return NextResponse.json(
      { error: "TRANSFER_NOT_FOUND", message: "No transfer record matches the supplied transferId." },
      { status: 404 }
    );
  }

  if (record.status !== "DEPOSITED") {
    return NextResponse.json(
      {
        error: "TRANSFER_NOT_READY",
        message: `Transfer status must be DEPOSITED to quote a withdrawal (current: ${record.status}).`,
      },
      { status: 409 }
    );
  }

  return NextResponse.json({
    success: true,
    transferId,
    destination: targetAddressInput,
    amount: record.amount,
    amountCents: record.amountCents,
    currency: TRANSFER_CURRENCY,
    chain: TRANSFER_RAIL,
    // Bridge custodies keys + sponsors gas: no on-chain top-up required.
    hasSufficientBalance: true,
    topUpWei: "0",
    gasSponsoredByBridge: true,
  });
}
