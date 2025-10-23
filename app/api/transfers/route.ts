import { NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { defaultEthereumAccountAtIndex } from "@turnkey/sdk-server";

import { getTurnkeyApiClient, isTurnkeyConfigured } from "@/lib/turnkey/server";

const TRANSFERS_TABLE = "blue-wallet-transfers";

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-2",
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);

type TransferRecord = {
  recipientKey: string;
  transferId: string;
  senderAddress: string;
  recipientAccountMask: string;
  recipientRoutingMask: string;
  recipientLast4: string;
  amount: string;
  amountCents: number;
  walletId: string;
  walletAddress: string;
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

function buildRecipientKey(routingNumber: string, accountNumber: string): string {
  const normalizedRouting = sanitizeDigits(routingNumber);
  const normalizedAccount = sanitizeDigits(accountNumber);

  return createHash("sha256")
    .update(`${normalizedRouting}|${normalizedAccount}`, "utf8")
    .digest("hex");
}

async function createRecipientWallet(walletName: string) {
  const client = getTurnkeyApiClient();

  if (!client) {
    throw new Error("Unable to initialize Turnkey client");
  }

  await client.createWallet({
    walletName,
    accounts: [defaultEthereumAccountAtIndex(0)],
  });

  const walletsResponse = await client.getWallets({});
  const wallets = walletsResponse.wallets ?? [];

  const createdWallet = wallets.find((wallet) => wallet.walletName === walletName);

  if (!createdWallet?.walletId) {
    throw new Error("Failed to locate created wallet");
  }

  const accountsResponse = await client.getWalletAccounts({
    walletId: createdWallet.walletId,
  });

  const primaryAccount = accountsResponse.accounts?.[0];

  if (!primaryAccount?.address) {
    throw new Error("Wallet account address is missing");
  }

  return {
    walletId: createdWallet.walletId,
    walletAddress: primaryAccount.address,
  };
}

export async function POST(request: Request) {
  if (!isTurnkeyConfigured()) {
    return NextResponse.json(
      {
        error: "TURNKEY_NOT_CONFIGURED",
        message: "Turnkey API keys are missing on the server.",
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
  const recipientKey = buildRecipientKey(normalizedRouting, normalizedAccount);
  const recipientLast4 = normalizedAccount.slice(-4);

  const walletName = `recipient-${Date.now()}-${randomUUID().slice(0, 8)}`;

  try {
    const { walletId, walletAddress } = await createRecipientWallet(walletName);

    const timestamp = new Date().toISOString();

    const record: TransferRecord = {
      recipientKey,
      transferId: randomUUID(),
      senderAddress: normalizeAddress(senderAddress),
      recipientAccountMask: normalizedAccount.slice(-4).padStart(normalizedAccount.length, "*"),
      recipientRoutingMask: normalizedRouting.slice(-4).padStart(normalizedRouting.length, "*"),
      recipientLast4,
      amount: normalizedAmount,
      amountCents,
      walletId,
      walletAddress,
      status: "DEPOSITED",
      depositMethod: "ach",
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
        walletId: record.walletId,
        walletAddress: record.walletAddress,
        amount: record.amount,
        status: record.status,
        accountMask: record.recipientAccountMask,
        routingMask: record.recipientRoutingMask,
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

    if (normalizedAccount && normalizedRouting) {
      const recipientKey = buildRecipientKey(normalizedRouting, normalizedAccount);

      const response = await docClient.send(
        new QueryCommand({
          TableName: TRANSFERS_TABLE,
          KeyConditionExpression: "recipientKey = :key",
          ExpressionAttributeValues: {
            ":key": recipientKey,
          },
        })
      );

      items = (response.Items ?? []) as TransferRecord[];
    }

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
        walletId: item.walletId,
        walletAddress: item.walletAddress,
        amount: item.amount,
        status: item.status,
        depositMethod: item.depositMethod === "simulated" ? "ach" : item.depositMethod,
        createdAt: item.createdAt,
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
