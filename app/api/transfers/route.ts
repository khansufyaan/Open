import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const TRANSFERS_TABLE = "blue-wallet-transfers";

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-2",
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);

type TransferRecord = {
  transferId: string;
  senderAddress: string;
  recipientRouting: string;
  recipientAccount: string;
  recipientLast4: string;
  amount: string;
  amountCents: number;
  status: "DEPOSITED" | "PENDING" | "FAILED" | "WITHDRAWN";
  depositMethod: string;
  createdAt: string;
  updatedAt: string;
  fundingTxHash?: string;
  fundingStatus?: "PENDING" | "CONFIRMED" | "FAILED";
  withdrawalTxHash?: string;
  withdrawalTargetAddress?: string;
  withdrawnAt?: string;
};

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

function sanitizeDigits(value: string): string {
  return value.replace(/\D+/g, "");
}

export async function POST(request: Request) {
  const companyWalletAddress = process.env.COMPANY_WALLET_ADDRESS;

  if (!companyWalletAddress) {
    return NextResponse.json(
      {
        error: "COMPANY_WALLET_NOT_CONFIGURED",
        message: "Company wallet address is not configured. Run scripts/provision-company-wallet.ts",
      },
      { status: 500 }
    );
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "INVALID_JSON",
        message: "Request body must be valid JSON.",
      },
      { status: 400 }
    );
  }

  const {
    senderAddress,
    recipientAccountNumber,
    recipientRoutingNumber,
    amount,
  } = (payload ?? {}) as Partial<Record<string, unknown>>;

  if (typeof senderAddress !== "string" || !senderAddress.startsWith("0x") || senderAddress.length !== 42) {
    return NextResponse.json(
      {
        error: "INVALID_SENDER_ADDRESS",
        message: "A valid Ethereum sender address is required.",
      },
      { status: 400 }
    );
  }

  if (typeof recipientAccountNumber !== "string" || sanitizeDigits(recipientAccountNumber).length < 4) {
    return NextResponse.json(
      {
        error: "INVALID_ACCOUNT_NUMBER",
        message: "Recipient account number is required.",
      },
      { status: 400 }
    );
  }

  if (typeof recipientRoutingNumber !== "string" || sanitizeDigits(recipientRoutingNumber).length !== 9) {
    return NextResponse.json(
      {
        error: "INVALID_ROUTING_NUMBER",
        message: "Recipient routing number must be 9 digits.",
      },
      { status: 400 }
    );
  }

  if ((typeof amount !== "string" && typeof amount !== "number") || Number(amount) <= 0) {
    return NextResponse.json(
      {
        error: "INVALID_AMOUNT",
        message: "A positive transfer amount is required.",
      },
      { status: 400 }
    );
  }

  const normalizedAmount = Number(amount).toFixed(2);
  const amountCents = Math.round(Number(normalizedAmount) * 100);
  const normalizedAccount = sanitizeDigits(recipientAccountNumber);
  const normalizedRouting = sanitizeDigits(recipientRoutingNumber);
  const recipientLast4 = normalizedAccount.slice(-4);

  try {
    const timestamp = new Date().toISOString();

    const record: TransferRecord = {
      transferId: randomUUID(),
      senderAddress: normalizeAddress(senderAddress),
      recipientRouting: normalizedRouting,
      recipientAccount: normalizedAccount,
      recipientLast4,
      amount: normalizedAmount,
      amountCents,
      status: "PENDING",
      depositMethod: "self_custody",
      createdAt: timestamp,
      updatedAt: timestamp,
      fundingStatus: "PENDING",
    };

    await docClient.send(
      new PutCommand({
        TableName: TRANSFERS_TABLE,
        Item: record,
      })
    );

    return NextResponse.json({
      success: true,
      transfer: {
        transferId: record.transferId,
        depositAddress: companyWalletAddress,
        amount: record.amount,
        status: record.status,
        fundingStatus: record.fundingStatus ?? "PENDING",
        fundingTxHash: record.fundingTxHash ?? null,
      },
    });
  } catch (error) {
    console.error("Transfer creation failed:", error);

    return NextResponse.json(
      {
        error: "TRANSFER_CREATION_FAILED",
        message: "Unable to create transfer record.",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accountNumber = searchParams.get("accountNumber");
  const routingNumber = searchParams.get("routingNumber");
  const last4Param = searchParams.get("last4");
  const amountParam = searchParams.get("amount");

  const normalizedAccount = accountNumber ? sanitizeDigits(accountNumber) : "";
  const normalizedRouting = routingNumber ? sanitizeDigits(routingNumber) : "";
  const normalizedLast4 = last4Param ? sanitizeDigits(last4Param).slice(-4) : "";
  const amountCentsHint = amountParam && !Number.isNaN(Number(amountParam))
    ? Math.round(Number(amountParam) * 100)
    : undefined;

  if (!normalizedAccount && !normalizedRouting && !normalizedLast4) {
    return NextResponse.json(
      {
        error: "MISSING_PARAMETERS",
        message: "Provide either account/routing numbers or last4 for lookup.",
      },
      { status: 400 }
    );
  }

  try {
    let items: TransferRecord[] = [];

    // Primary match: Exact routing + account match
    if (normalizedAccount && normalizedRouting) {
      const response = await docClient.send(
        new ScanCommand({
          TableName: TRANSFERS_TABLE,
          FilterExpression: "recipientRouting = :routing AND recipientAccount = :account",
          ExpressionAttributeValues: {
            ":routing": normalizedRouting,
            ":account": normalizedAccount,
          },
        })
      );

      items = (response.Items ?? []) as TransferRecord[];
    }

    // Fallback match: Last4 + amount (for tokenized accounts)
    if (items.length === 0 && normalizedLast4) {
      const filterExpressions = ["recipientLast4 = :last4"];
      const expressionValues: Record<string, unknown> = {
        ":last4": normalizedLast4,
      };

      if (typeof amountCentsHint === "number" && !Number.isNaN(amountCentsHint)) {
        filterExpressions.push("amountCents = :amountCents");
        expressionValues[":amountCents"] = amountCentsHint;
      }

      const scanResponse = await docClient.send(
        new ScanCommand({
          TableName: TRANSFERS_TABLE,
          FilterExpression: filterExpressions.join(" AND "),
          ExpressionAttributeValues: expressionValues,
        })
      );

      const fallbackItems = (scanResponse.Items ?? []) as TransferRecord[];

      if (fallbackItems.length > 0) {
        fallbackItems.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        items = [fallbackItems[0]];
      }
    }

    return NextResponse.json({
      success: true,
      transfers: items.map((item) => ({
        transferId: item.transferId,
        depositAddress: process.env.COMPANY_WALLET_ADDRESS,
        amount: item.amount,
        status: item.status,
        depositMethod: item.depositMethod === "simulated" ? "ach" : item.depositMethod,
        createdAt: item.createdAt,
        fundingStatus: item.fundingStatus ?? null,
        fundingTxHash: item.fundingTxHash ?? null,
        withdrawalTxHash: item.withdrawalTxHash ?? null,
        withdrawalTargetAddress: item.withdrawalTargetAddress ?? null,
        withdrawnAt: item.withdrawnAt ?? null,
      })),
    });
  } catch (error) {
    console.error("Transfer lookup failed:", error);

    return NextResponse.json(
      {
        error: "TRANSFER_LOOKUP_FAILED",
        message: "Unable to fetch transfers for the supplied account.",
      },
      { status: 500 }
    );
  }
}
