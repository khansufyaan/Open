import { NextResponse } from "next/server";
import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

import { docClient, USERS_TABLE as TABLE_NAME } from "@/lib/db/dynamo";

// GET: Retrieve user data
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  console.log("[DB] GET /api/db/user - Request received for userId:", userId);

  if (!userId) {
    console.error("[DB] Missing userId in GET request");
    return NextResponse.json(
      {
        error: "MISSING_USER_ID",
        message: "userId is required",
      },
      { status: 400 }
    );
  }

  try {
    console.log("[DB] Fetching user from DynamoDB");
    const command = new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        userId,
      },
    });

    const response = await docClient.send(command);

    if (!response.Item) {
      console.log("[DB] User not found in database");
      return NextResponse.json(
        {
          error: "USER_NOT_FOUND",
          message: "User not found",
        },
        { status: 404 }
      );
    }

    console.log("[DB] User found, returning data");

    const { plaidAccessToken: _plaidAccessToken, ...sanitizedUser } = response.Item as Record<string, unknown>;
    void _plaidAccessToken;

    return NextResponse.json({
      success: true,
      user: sanitizedUser,
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
  console.log("[DB] POST /api/db/user - Request received");
  let body: unknown;

  try {
    body = await request.json();
  } catch (error) {
    console.error("[DB] Failed to parse JSON:", error);
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
    signInCompleted?: boolean;
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
    plaidVerifiedAccountMask?: string;
    plaidVerifiedRoutingNumber?: string;
    plaidAchAccounts?: Array<{
      accountId: string;
      accountNumber: string;
      routingNumber: string;
      wireRoutingNumber?: string | null;
      mask?: string | null;
      name?: string | null;
    }>;
    plaidIdentitySnapshot?: {
      names: string[];
      emails: string[];
      phones: string[];
      addresses: Array<{
        street: string;
        city: string;
        region: string;
        postal_code: string;
        country: string;
      }>;
    };
    plaidAccessToken?: string;
    plaidItemId?: string;
    plaidLastLinkedAt?: string;
  };

  if (!data.userId) {
    console.error("[DB] Missing userId in request");
    return NextResponse.json(
      {
        error: "MISSING_USER_ID",
        message: "userId is required",
      },
      { status: 400 }
    );
  }

  console.log("[DB] Processing request for userId:", data.userId);

  try {
    const timestamp = new Date().toISOString();

    // Get existing user data to merge
    console.log("[DB] Checking for existing user data");
    const getCommand = new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        userId: data.userId,
      },
    });

    const existingData = await docClient.send(getCommand);
    const isNewUser = !existingData.Item;
    console.log("[DB] User exists:", !isNewUser);

    const userData = {
      // Preserve any fields written by other routes (Persona/Bridge/session).
      ...(existingData.Item ?? {}),
      userId: data.userId,
      email: data.email ?? existingData.Item?.email,
      walletId: data.walletId ?? existingData.Item?.walletId,
      walletAddress: data.walletAddress ?? existingData.Item?.walletAddress,
      signInCompleted:
        data.signInCompleted ?? existingData.Item?.signInCompleted ?? false,
      walletCreated: data.walletCreated ?? existingData.Item?.walletCreated ?? false,
      plaidVerifiedName: data.plaidVerifiedName ?? existingData.Item?.plaidVerifiedName,
      plaidVerifiedEmail: data.plaidVerifiedEmail ?? existingData.Item?.plaidVerifiedEmail,
      plaidVerifiedPhone: data.plaidVerifiedPhone ?? existingData.Item?.plaidVerifiedPhone,
      plaidVerifiedAddress: data.plaidVerifiedAddress ?? existingData.Item?.plaidVerifiedAddress,
      plaidVerificationCompleted:
        data.plaidVerificationCompleted ?? existingData.Item?.plaidVerificationCompleted ?? false,
      plaidVerifiedAccountMask:
        data.plaidVerifiedAccountMask ?? existingData.Item?.plaidVerifiedAccountMask,
      plaidVerifiedRoutingNumber:
        data.plaidVerifiedRoutingNumber ?? existingData.Item?.plaidVerifiedRoutingNumber,
      plaidAchAccounts: data.plaidAchAccounts ?? existingData.Item?.plaidAchAccounts,
      plaidIdentitySnapshot:
        data.plaidIdentitySnapshot ?? existingData.Item?.plaidIdentitySnapshot,
      plaidAccessToken: data.plaidAccessToken ?? existingData.Item?.plaidAccessToken,
      plaidItemId: data.plaidItemId ?? existingData.Item?.plaidItemId,
      plaidLastLinkedAt: data.plaidLastLinkedAt ?? existingData.Item?.plaidLastLinkedAt,
      createdAt: existingData.Item?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: userData,
    });

    console.log("[DB] Writing user data to DynamoDB");
    await docClient.send(command);
    console.log("[DB] Successfully saved user data");

    return NextResponse.json({
      success: true,
      message: isNewUser ? "User created successfully" : "User updated successfully",
      user: userData,
    });
  } catch (error) {
    console.error("[DB] Failed to save user:", error);
    console.error("[DB] Error details:", {
      name: error instanceof Error ? error.name : "Unknown",
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

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
