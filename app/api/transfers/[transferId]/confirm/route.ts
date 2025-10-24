import { NextResponse } from "next/server";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const TRANSFERS_TABLE = "blue-wallet-transfers";

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-2",
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);

type TransferRecord = {
  transferId: string;
  recipientRouting: string;
  recipientAccount: string;
  recipientLast4: string;
  recipientName?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  amount: string;
  amountCents: number;
  status: "DEPOSITED" | "PENDING" | "FAILED" | "WITHDRAWN";
  createdAt: string;
};

function sanitizeDigits(value: string): string {
  return value.replace(/\D+/g, "");
}

async function findTransferById(transferId: string): Promise<TransferRecord | null> {
  const response = await docClient.send(
    new ScanCommand({
      TableName: TRANSFERS_TABLE,
      FilterExpression: "transferId = :transferId",
      ExpressionAttributeValues: {
        ":transferId": transferId,
      },
    })
  );

  const record = response.Items?.[0] as TransferRecord | undefined;
  return record ?? null;
}

type RouteParams = {
  transferId: string;
};

type RouteContext = {
  params: Promise<RouteParams> | RouteParams;
};

export async function POST(request: Request, context: RouteContext) {
  const resolvedParams = await Promise.resolve(context.params);
  const { transferId } = resolvedParams ?? {};

  if (!transferId) {
    return NextResponse.json(
      {
        error: "MISSING_TRANSFER_ID",
        message: "transferId parameter is required.",
      },
      { status: 400 }
    );
  }

  let body: unknown;

  try {
    body = await request.json();
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
    accountNumber,
    routingNumber,
  } = (body ?? {}) as Partial<Record<string, unknown>>;

  const normalizedAccount = typeof accountNumber === "string" ? sanitizeDigits(accountNumber) : "";
  const normalizedRouting = typeof routingNumber === "string" ? sanitizeDigits(routingNumber) : "";

  if (!normalizedAccount || !normalizedRouting) {
    return NextResponse.json(
      {
        error: "MISSING_ACCOUNT_DETAILS",
        message: "Both accountNumber and routingNumber are required for confirmation.",
      },
      { status: 400 }
    );
  }

  try {
    const record = await findTransferById(transferId);

    if (!record) {
      return NextResponse.json(
        {
          error: "TRANSFER_NOT_FOUND",
          message: "No transfer record matches the supplied transferId.",
        },
        { status: 404 }
      );
    }

    // Verify the account details match
    if (
      record.recipientAccount !== normalizedAccount ||
      record.recipientRouting !== normalizedRouting
    ) {
      return NextResponse.json(
        {
          error: "ACCOUNT_MISMATCH",
          message: "The provided account details do not match this transfer.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      confirmed: true,
      transfer: {
        transferId: record.transferId,
        depositAddress: process.env.COMPANY_WALLET_ADDRESS,
        amount: record.amount,
        status: record.status,
        recipientName: record.recipientName ?? null,
        recipientEmail: record.recipientEmail ?? null,
        recipientPhone: record.recipientPhone ?? null,
        recipientLast4: record.recipientLast4,
        createdAt: record.createdAt,
      },
    });
  } catch (error) {
    console.error("Transfer confirmation failed:", error);

    return NextResponse.json(
      {
        error: "CONFIRMATION_FAILED",
        message: "Unable to confirm transfer.",
      },
      { status: 500 }
    );
  }
}
