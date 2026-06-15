import { NextResponse } from "next/server";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

import {
  createTransfer,
  getTransferTxHash,
  isBridgeConfigured,
  BridgeRequestError,
} from "@/lib/bridge/server";

const TRANSFERS_TABLE = "blue-wallet-transfers";
const TRANSFER_RAIL = process.env.BRIDGE_DEFAULT_CHAIN ?? "base";
const TRANSFER_CURRENCY = process.env.BRIDGE_TRANSFER_CURRENCY ?? "usdc";

type TransferRecord = {
  transferId: string;
  recipientKey: string;
  amount: string;
  amountCents: number;
  status: "DEPOSITED" | "PENDING" | "FAILED" | "CLAIMED" | "WITHDRAWN";
  walletAddress?: string;
  walletId?: string;
  walletName?: string;
  fundingStatus?: string;
  fundingTxHash?: string;
  claimedAt?: string;
  claimTxHash?: string;
  depositAddress?: string;
};

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-2",
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);

type RouteParams = { transferId: string };
type RouteContext = { params: Promise<RouteParams> | RouteParams };

async function findTransferById(transferId: string): Promise<TransferRecord | null> {
  const response = await docClient.send(
    new ScanCommand({
      TableName: TRANSFERS_TABLE,
      FilterExpression: "transferId = :transferId",
      ExpressionAttributeValues: { ":transferId": transferId },
    })
  );

  const record = (response.Items ?? [])[0] as TransferRecord | undefined;
  return record ?? null;
}

export async function POST(request: Request, context: RouteContext) {
  if (!isBridgeConfigured()) {
    return NextResponse.json(
      { error: "BRIDGE_NOT_CONFIGURED", message: "Bridge API key is missing on the server." },
      { status: 500 }
    );
  }

  const companyCustomerId = process.env.BRIDGE_COMPANY_CUSTOMER_ID;
  const companyWalletId = process.env.BRIDGE_COMPANY_WALLET_ID;

  if (!companyCustomerId || !companyWalletId) {
    return NextResponse.json(
      {
        error: "COMPANY_WALLET_NOT_CONFIGURED",
        message:
          "Set BRIDGE_COMPANY_CUSTOMER_ID and BRIDGE_COMPANY_WALLET_ID for the company vault wallet.",
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

  const record = await findTransferById(transferId);

  if (!record) {
    return NextResponse.json(
      { error: "TRANSFER_NOT_FOUND", message: "No transfer matched the provided transferId." },
      { status: 404 }
    );
  }

  if (!record.walletId) {
    return NextResponse.json(
      {
        error: "RECIPIENT_WALLET_MISSING",
        message: "Transfer is missing a provisioned recipient wallet.",
      },
      { status: 409 }
    );
  }

  if (record.status === "CLAIMED" || record.status === "WITHDRAWN") {
    return NextResponse.json(
      { error: "ALREADY_CLAIMED", message: "This transfer has already been claimed." },
      { status: 409 }
    );
  }

  if (record.status !== "DEPOSITED") {
    return NextResponse.json(
      {
        error: "TRANSFER_NOT_READY",
        message: `Transfer must be DEPOSITED before claim (current: ${record.status}).`,
      },
      { status: 409 }
    );
  }

  if (Number(record.amount) <= 0) {
    return NextResponse.json(
      { error: "INVALID_AMOUNT", message: "Transfer amount must be greater than zero to claim." },
      { status: 400 }
    );
  }

  try {
    // Move funds from the company vault wallet into the recipient's managed wallet.
    const transfer = await createTransfer({
      amount: record.amount,
      onBehalfOf: companyCustomerId,
      idempotencyKey: `claim:${record.transferId}`,
      source: {
        payment_rail: TRANSFER_RAIL,
        currency: TRANSFER_CURRENCY,
        bridge_wallet_id: companyWalletId,
      },
      destination: {
        payment_rail: TRANSFER_RAIL,
        currency: TRANSFER_CURRENCY,
        bridge_wallet_id: record.walletId,
      },
    });

    const txHash = getTransferTxHash(transfer) ?? transfer.id;
    const timestamp = new Date().toISOString();

    await docClient.send(
      new UpdateCommand({
        TableName: TRANSFERS_TABLE,
        Key: {
          recipientKey: record.recipientKey,
          transferId: record.transferId,
        },
        UpdateExpression:
          "SET #status = :claimed, claimTxHash = :txHash, bridgeClaimTransferId = :bridgeId, claimedAt = :claimedAt, updatedAt = :updatedAt",
        ConditionExpression: "#status = :deposited",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":claimed": "CLAIMED",
          ":deposited": "DEPOSITED",
          ":txHash": txHash,
          ":bridgeId": transfer.id,
          ":claimedAt": timestamp,
          ":updatedAt": timestamp,
        },
      })
    );

    return NextResponse.json({
      success: true,
      txHash,
      bridgeTransferId: transfer.id,
      state: transfer.state,
    });
  } catch (error) {
    console.error("Transfer claim failed:", error);

    if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
      return NextResponse.json(
        { error: "ALREADY_CLAIMED", message: "This transfer has already been claimed." },
        { status: 409 }
      );
    }

    if (error instanceof BridgeRequestError) {
      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details ?? null },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        error: "CLAIM_FAILED",
        message: error instanceof Error ? error.message : "Failed to claim funds from vault.",
      },
      { status: 500 }
    );
  }
}
