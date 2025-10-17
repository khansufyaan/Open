import { NextResponse } from "next/server";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = "blue-wallet-users";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-2",
});

const docClient = DynamoDBDocumentClient.from(client);

// GET: Retrieve user data
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json(
      {
        error: "MISSING_USER_ID",
        message: "userId is required",
      },
      { status: 400 }
    );
  }

  try {
    const command = new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        userId,
      },
    });

    const response = await docClient.send(command);

    if (!response.Item) {
      return NextResponse.json(
        {
          error: "USER_NOT_FOUND",
          message: "User not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      user: response.Item,
    });
  } catch (error) {
    console.error("Failed to get user:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: "Failed to retrieve user data",
      },
      { status: 500 }
    );
  }
}

// POST: Create or update user data
export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "INVALID_JSON",
        message: "Request body must be valid JSON",
      },
      { status: 400 }
    );
  }

  const data = body as {
    userId?: string;
    email?: string;
    walletId?: string;
    walletAddress?: string;
    turnkeySignInCompleted?: boolean;
    walletCreated?: boolean;
    plaidVerifiedName?: string;
    plaidVerifiedEmail?: string;
    plaidVerifiedPhone?: string;
    plaidVerifiedAddress?: {
      street: string;
      city: string;
      region: string;
      postal_code: string;
      country: string;
    };
    plaidVerificationCompleted?: boolean;
  };

  if (!data.userId) {
    return NextResponse.json(
      {
        error: "MISSING_USER_ID",
        message: "userId is required",
      },
      { status: 400 }
    );
  }

  try {
    const timestamp = new Date().toISOString();

    // Get existing user data to merge
    const getCommand = new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        userId: data.userId,
      },
    });

    const existingData = await docClient.send(getCommand);
    const isNewUser = !existingData.Item;

    const userData = {
      userId: data.userId,
      email: data.email ?? existingData.Item?.email,
      walletId: data.walletId ?? existingData.Item?.walletId,
      walletAddress: data.walletAddress ?? existingData.Item?.walletAddress,
      turnkeySignInCompleted:
        data.turnkeySignInCompleted ?? existingData.Item?.turnkeySignInCompleted ?? false,
      walletCreated: data.walletCreated ?? existingData.Item?.walletCreated ?? false,
      plaidVerifiedName: data.plaidVerifiedName ?? existingData.Item?.plaidVerifiedName,
      plaidVerifiedEmail: data.plaidVerifiedEmail ?? existingData.Item?.plaidVerifiedEmail,
      plaidVerifiedPhone: data.plaidVerifiedPhone ?? existingData.Item?.plaidVerifiedPhone,
      plaidVerifiedAddress: data.plaidVerifiedAddress ?? existingData.Item?.plaidVerifiedAddress,
      plaidVerificationCompleted:
        data.plaidVerificationCompleted ?? existingData.Item?.plaidVerificationCompleted ?? false,
      createdAt: existingData.Item?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: userData,
    });

    await docClient.send(command);

    return NextResponse.json({
      success: true,
      message: isNewUser ? "User created successfully" : "User updated successfully",
      user: userData,
    });
  } catch (error) {
    console.error("Failed to save user:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: "Failed to save user data",
      },
      { status: 500 }
    );
  }
}
