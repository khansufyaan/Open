import { NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { TurnkeyRequestError, defaultEthereumAccountAtIndex } from "@turnkey/sdk-server";
import { randomBytes } from "crypto";

import {
  getTurnkeyApiClient,
  getTurnkeyOrganizationId,
  isTurnkeyConfigured,
} from "@/lib/turnkey/server";

const TRANSFERS_TABLE = "blue-wallet-transfers";
const RECIPIENT_WALLETS_TABLE =
  process.env.RECIPIENT_WALLETS_TABLE ?? "blue-wallet-recipient-wallets";

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-2",
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);

type TransferRecord = {
  recipientKey: string;
  transferId: string;
  senderAddress: string;
  recipientRouting: string;
  recipientAccount: string;
  recipientLast4: string;
  amount: string;
  amountCents: number;
  amountWithSurchargeCents: number;
  surchargePercentage: number;
  status: "DEPOSITED" | "PENDING" | "FAILED" | "CLAIMED" | "WITHDRAWN";
  depositMethod: string;
  createdAt: string;
  updatedAt: string;
  fundingTxHash?: string;
  fundingStatus?: "PENDING" | "CONFIRMED" | "FAILED";
  withdrawalTxHash?: string;
  withdrawalTargetAddress?: string;
  withdrawnAt?: string;
  walletId?: string;
  walletAddress?: string;
  walletCreatedAt?: string;
  walletName?: string;
  claimedAt?: string;
  claimTxHash?: string;
  depositAddress?: string;
};

type RecipientWalletRecord = {
  recipientKey: string;
  walletId: string;
  walletAddress: string;
  walletCreatedAt: string;
  walletName?: string;
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

function getSurchargePercentage(): number {
  const envValue = process.env.SURCHARGE_PERCENTAGE;
  const parsed = envValue ? parseFloat(envValue) : 5;
  return !isNaN(parsed) && parsed >= 0 && parsed <= 100 ? parsed : 5;
}

function applySurcharge(amountCents: number, surchargePercentage: number): number {
  const surchargeAmount = Math.round(amountCents * (surchargePercentage / 100));
  return amountCents + surchargeAmount;
}

async function findWalletInTransfers(recipientKey: string): Promise<RecipientWalletRecord | null> {
  const response = await docClient.send(
    new ScanCommand({
      TableName: TRANSFERS_TABLE,
      FilterExpression: "recipientKey = :recipientKey AND attribute_exists(walletAddress)",
      ExpressionAttributeValues: {
        ":recipientKey": recipientKey,
      },
      Limit: 1,
    })
  );

  const fallbackItem = response.Items?.[0] as TransferRecord | undefined;
  if (!fallbackItem?.walletId || !fallbackItem.walletAddress) {
    return null;
  }

  return {
    recipientKey,
    walletId: fallbackItem.walletId,
    walletAddress: fallbackItem.walletAddress,
    walletCreatedAt: fallbackItem.walletCreatedAt ?? fallbackItem.createdAt,
    walletName: fallbackItem.walletName,
  };
}

async function getRecipientWallet(recipientKey: string): Promise<RecipientWalletRecord | null> {
  try {
    const response = await docClient.send(
      new GetCommand({
        TableName: RECIPIENT_WALLETS_TABLE,
        Key: { recipientKey },
      })
    );

    if (!response.Item) {
      return null;
    }

    const item = response.Item as RecipientWalletRecord;
    if (!item.walletId || !item.walletAddress) {
      return null;
    }

    return item;
  } catch (error) {
    if (error instanceof Error && error.name === "ResourceNotFoundException") {
      return findWalletInTransfers(recipientKey);
    }

    console.error("Failed to fetch recipient wallet", error);
    throw new Error("Unable to load recipient wallet mapping.");
  }
}

async function saveRecipientWallet(record: RecipientWalletRecord): Promise<void> {
  try {
    await docClient.send(
      new PutCommand({
        TableName: RECIPIENT_WALLETS_TABLE,
        Item: record,
        ConditionExpression: "attribute_not_exists(recipientKey)",
      })
    );
  } catch (error) {
    if (error instanceof Error && error.name === "ConditionalCheckFailedException") {
      // Another request inserted the wallet first. Swallow so caller refetches.
      return;
    }

    if (error instanceof Error && error.name === "ResourceNotFoundException") {
      console.warn("Recipient wallet table missing; skip persistence");
      return;
    }

    console.error("Failed to persist recipient wallet", error);
    throw new Error("Unable to persist recipient wallet mapping.");
  }
}

async function createRecipientWallet(recipientKey: string): Promise<RecipientWalletRecord> {
  if (!isTurnkeyConfigured()) {
    throw new Error("Turnkey is not configured for wallet provisioning.");
  }

  const client = getTurnkeyApiClient();
  const organizationId = getTurnkeyOrganizationId();

  if (!client || !organizationId) {
    throw new Error("Unable to initialize Turnkey client for wallet provisioning.");
  }

  const walletName = `Recipient-${recipientKey.slice(0, 12)}`;

  const resolveWalletId = async (): Promise<{ walletId: string | null; walletName?: string } | null> => {
    const walletsResponse = await client.getWallets({ organizationId });
    const matched = walletsResponse.wallets?.find((wallet) => wallet.walletName === walletName);
    if (!matched) {
      return null;
    }
  const matchedId = matched.walletId ?? matched.walletIds?.[0] ?? null;
  if (!matchedId) {
    return null;
  }
  return {
    walletId: matchedId,
    walletName: matched.walletName ?? walletName,
  };
};

  const existing = await resolveWalletId();

  let walletId: string | null = existing?.walletId ?? null;
  let finalWalletName = existing?.walletName ?? walletName;

  if (!walletId) {
    let attemptName = walletName;
    for (let attempt = 0; attempt < 3 && !walletId; attempt += 1) {
      try {
        const createResponse = await client.createWallet({
          organizationId,
          walletName: attemptName,
          accounts: [defaultEthereumAccountAtIndex(0)],
        });

        walletId =
          (createResponse as { walletId?: string }).walletId ??
          ((createResponse as { wallet?: { walletId?: string } }).wallet?.walletId ?? null);
        finalWalletName = attemptName;
      } catch (error) {
        if (error instanceof TurnkeyRequestError && error.code === 3) {
          const resolved = await resolveWalletId();
          if (resolved?.walletId) {
            walletId = resolved.walletId;
            finalWalletName = resolved.walletName ?? attemptName;
            break;
          }

          attemptName = `${walletName}-${randomBytes(2).toString("hex")}`;
        } else {
          throw error instanceof Error ? error : new Error("Turnkey wallet provisioning failed.");
        }
      }
    }
  }

  if (!walletId) {
    const resolved = await resolveWalletId();
    if (resolved?.walletId) {
      walletId = resolved.walletId;
      finalWalletName = resolved.walletName ?? walletName;
    }
  }

  if (!walletId) {
    throw new Error("Turnkey did not return a wallet identifier.");
  }

  const accountsResponse = await client.getWalletAccounts({ walletId });
  const account = accountsResponse.accounts?.[0];
  const walletAddress = account?.address?.toLowerCase();

  if (!walletAddress) {
    throw new Error("Turnkey wallet does not expose an EVM address.");
  }

  const record: RecipientWalletRecord = {
    recipientKey,
    walletId,
    walletAddress,
    walletCreatedAt: new Date().toISOString(),
    walletName: finalWalletName,
  };

  await saveRecipientWallet(record);

  return record;
}

async function ensureRecipientWallet(recipientKey: string): Promise<RecipientWalletRecord> {
  const existing = await getRecipientWallet(recipientKey);
  if (existing) {
    return existing;
  }

  try {
    return await createRecipientWallet(recipientKey);
  } catch (error) {
    if (error instanceof Error && error.message.includes("persist recipient wallet")) {
      const fallback = await getRecipientWallet(recipientKey);
      if (fallback) {
        return fallback;
      }
    }

    throw error instanceof Error ? error : new Error("Failed to provision recipient wallet.");
  }
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
  const recipientKey = buildRecipientKey(normalizedRouting, normalizedAccount);
  const recipientLast4 = normalizedAccount.slice(-4);

  // Apply surcharge (default 3%)
  const surchargePercentage = getSurchargePercentage();
  const amountWithSurchargeCents = applySurcharge(amountCents, surchargePercentage);
  const amountWithSurcharge = (amountWithSurchargeCents / 100).toFixed(2);

  let recipientWallet: RecipientWalletRecord;

  try {
    recipientWallet = await ensureRecipientWallet(recipientKey);
  } catch (error) {
    console.error("Recipient wallet provisioning failed", error);
    return NextResponse.json(
      {
        error: "WALLET_PROVISIONING_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Unable to provision a recipient wallet.",
      },
      { status: 500 }
    );
  }

  try {
    const timestamp = new Date().toISOString();

    const record: TransferRecord = {
      recipientKey,
      transferId: randomUUID(),
      senderAddress: normalizeAddress(senderAddress),
      recipientRouting: normalizedRouting,
      recipientAccount: normalizedAccount,
      recipientLast4,
      amount: normalizedAmount,
      amountCents,
      amountWithSurchargeCents,
      surchargePercentage,
      status: "PENDING",
      depositMethod: "self_custody",
      createdAt: timestamp,
      updatedAt: timestamp,
      fundingStatus: "PENDING",
      walletId: recipientWallet.walletId,
      walletAddress: recipientWallet.walletAddress,
      walletCreatedAt: recipientWallet.walletCreatedAt,
      walletName: recipientWallet.walletName,
      claimedAt: undefined,
      claimTxHash: undefined,
      depositAddress: companyWalletAddress,
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
        walletAddress: record.walletAddress,
        amount: record.amount,
        amountWithSurcharge, // User sees this at signature
        surchargePercentage,
        status: record.status,
        fundingStatus: record.fundingStatus ?? "PENDING",
        fundingTxHash: record.fundingTxHash ?? null,
        recipientWalletAddress: record.walletAddress,
        recipientWalletId: record.walletId,
        recipientWalletName: record.walletName ?? null,
        claimTxHash: record.claimTxHash ?? null,
        claimedAt: record.claimedAt ?? null,
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
  const senderAddress = searchParams.get("senderAddress");

  const normalizedAccount = accountNumber ? sanitizeDigits(accountNumber) : "";
  const normalizedRouting = routingNumber ? sanitizeDigits(routingNumber) : "";
  const normalizedLast4 = last4Param ? sanitizeDigits(last4Param).slice(-4) : "";
  const amountCentsHint = amountParam && !Number.isNaN(Number(amountParam))
    ? Math.round(Number(amountParam) * 100)
    : undefined;

  if (!normalizedAccount && !normalizedRouting && !normalizedLast4 && !senderAddress) {
    return NextResponse.json(
      {
        error: "MISSING_PARAMETERS",
        message: "Provide either account/routing numbers, last4, or sender address for lookup.",
      },
      { status: 400 }
    );
  }

  try {
    let items: TransferRecord[] = [];

    // Sender address lookup
    if (senderAddress && !normalizedAccount && !normalizedRouting) {
      const response = await docClient.send(
        new ScanCommand({
          TableName: TRANSFERS_TABLE,
          FilterExpression: "senderAddress = :senderAddress",
          ExpressionAttributeValues: {
            ":senderAddress": normalizeAddress(senderAddress),
          },
        })
      );

      items = (response.Items ?? []) as TransferRecord[];
      items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }
    // Primary match: Exact routing + account match
    else if (normalizedAccount && normalizedRouting) {
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
        items = [fallbackItems[0]]; // Return most recent match
      }
    }

    return NextResponse.json({
      success: true,
      transfers: items.map((item) => ({
        transferId: item.transferId,
        depositAddress: process.env.COMPANY_WALLET_ADDRESS,
        walletAddress: item.walletAddress ?? null,
        recipientWalletAddress: item.walletAddress ?? null,
        recipientWalletId: item.walletId ?? null,
        recipientWalletName: item.walletName ?? null,
        amount: item.amount,
        status: item.status,
        depositMethod: item.depositMethod === "simulated" ? "ach" : item.depositMethod,
        createdAt: item.createdAt,
        recipientLast4: item.recipientLast4,
        fundingStatus: item.fundingStatus ?? null,
        fundingTxHash: item.fundingTxHash ?? null,
        claimTxHash: item.claimTxHash ?? null,
        claimedAt: item.claimedAt ?? null,
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
