import { NextResponse } from "next/server";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const TRANSFERS_TABLE = "blue-wallet-transfers";

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-2",
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);

type FundingStatus = "PENDING" | "CONFIRMED" | "FAILED";

function isHexHash(value: unknown): value is string {
  return typeof value === "string" && /^0x([a-fA-F0-9]{64})$/.test(value);
}

async function findTransferById(transferId: string) {
  const response = await docClient.send(
    new ScanCommand({
      TableName: TRANSFERS_TABLE,
      FilterExpression: "transferId = :transferId",
      ExpressionAttributeValues: {
        ":transferId": transferId,
      },
    })
  );

  const item = response.Items?.[0];
  if (!item) {
    return null;
  }

  return {
    recipientKey: item.recipientKey as string,
    transferId: item.transferId as string,
  };
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

  const statusInput =
    typeof body === "object" && body && "status" in body
      ? String((body as { status?: unknown }).status ?? "")
      : "";

  if (!statusInput) {
    return NextResponse.json(
      {
        error: "INVALID_STATUS",
        message: "Provide a funding status.",
      },
      { status: 400 }
    );
  }

  const normalizedStatus = statusInput.toUpperCase();

  if (!["PENDING", "CONFIRMED", "FAILED"].includes(normalizedStatus)) {
    return NextResponse.json(
      {
        error: "UNSUPPORTED_STATUS",
        message: "Status must be PENDING, CONFIRMED, or FAILED.",
      },
      { status: 400 }
    );
  }

  const txHashInput =
    typeof body === "object" && body && "txHash" in body
      ? (body as { txHash?: unknown }).txHash
      : undefined;

  if (txHashInput && typeof txHashInput === "string" && txHashInput.length > 0 && !isHexHash(txHashInput)) {
    return NextResponse.json(
      {
        error: "INVALID_TX_HASH",
        message: "txHash must be a 66-character hex string (0x...).",
      },
      { status: 400 }
    );
  }

  const identifiers = await findTransferById(transferId);

  if (!identifiers) {
    return NextResponse.json(
      {
        error: "TRANSFER_NOT_FOUND",
        message: "No transfer record matches the supplied transferId.",
      },
      { status: 404 }
    );
  }

  const timestamp = new Date().toISOString();

  const updateExpressions = ["#fundingStatus = :status", "updatedAt = :updatedAt"];
  const attributeNames: Record<string, string> = {
    "#fundingStatus": "fundingStatus",
  };
  const attributeValues: Record<string, unknown> = {
    ":status": normalizedStatus as FundingStatus,
    ":updatedAt": timestamp,
  };

  if (normalizedStatus === "CONFIRMED") {
    updateExpressions.push("#transferStatus = :deposited", "depositedAt = :depositedAt");
    attributeNames["#transferStatus"] = "status";
    attributeValues[":deposited"] = "DEPOSITED";
    attributeValues[":depositedAt"] = timestamp;
  } else if (normalizedStatus === "FAILED") {
    updateExpressions.push("#transferStatus = :failed");
    attributeNames["#transferStatus"] = "status";
    attributeValues[":failed"] = "FAILED";
  }

  if (typeof txHashInput === "string") {
    updateExpressions.push("fundingTxHash = :txHash");
    attributeValues[":txHash"] = txHashInput;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: TRANSFERS_TABLE,
      Key: {
        recipientKey: identifiers.recipientKey,
        transferId: identifiers.transferId,
      },
      UpdateExpression: `SET ${updateExpressions.join(", ")}`,
      ExpressionAttributeNames: attributeNames,
      ExpressionAttributeValues: attributeValues,
    })
  );

  return NextResponse.json({
    success: true,
  });
}
