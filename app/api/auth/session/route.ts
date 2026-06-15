import { NextResponse } from "next/server";

import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

import { docClient, USERS_TABLE as TABLE_NAME } from "@/lib/db/dynamo";
import { verifyAuth, getPrivyEmail, isPrivyConfigured, authNotConfigured, unauthorized } from "@/lib/auth/privy";

/**
 * Establishes (upserts) the app user record for the authenticated Privy user.
 *
 * The userId is the verified Privy DID — it is never derived from request
 * input. Identity is verified separately via Bridge-hosted KYC (see
 * /api/bridge/kyc-status) before any wallet or transfer capability is unlocked.
 */
export async function POST(request: Request) {
  if (!isPrivyConfigured()) {
    return authNotConfigured();
  }

  const auth = await verifyAuth(request);
  if (!auth) {
    return unauthorized();
  }

  const userId = auth.userId;

  try {
    const existing = await docClient.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { userId } })
    );

    const email = (await getPrivyEmail(userId)) ?? (existing.Item?.email as string | undefined);
    const timestamp = new Date().toISOString();
    const isNewUser = !existing.Item;

    const userData = {
      ...(existing.Item ?? {}),
      userId,
      ...(email ? { email } : {}),
      signInCompleted: true,
      createdAt: existing.Item?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: userData }));

    return NextResponse.json({
      success: true,
      userId,
      email: email ?? null,
      personaVerificationCompleted: Boolean(existing.Item?.personaVerificationCompleted),
      isNewUser,
    });
  } catch (error) {
    console.error("[Auth Session] Failed to establish session:", error);
    return NextResponse.json(
      {
        error: "SESSION_FAILED",
        message: error instanceof Error ? error.message : "Unable to establish session.",
      },
      { status: 500 }
    );
  }
}
