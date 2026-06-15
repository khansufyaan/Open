import { NextResponse } from "next/server";
import { createHash } from "crypto";

import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

import { docClient, USERS_TABLE as TABLE_NAME } from "@/lib/db/dynamo";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Deterministic user id so re-signing in with the same email resolves the same record. */
function deriveUserId(email: string): string {
  return createHash("sha256").update(`bluewallet:user:${email}`, "utf8").digest("hex");
}

/**
 * Establishes an app session for an email address.
 *
 * This replaces the former Turnkey email-OTP sign-in. Identity is verified
 * separately via Persona (see /api/persona/inquiry) before any wallet or
 * transfer capability is unlocked.
 */
export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON", message: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const email = normalizeEmail((body as { email?: string })?.email ?? "");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "INVALID_EMAIL", message: "Provide a valid email address to sign in." },
      { status: 400 }
    );
  }

  const userId = deriveUserId(email);

  try {
    const existing = await docClient.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { userId } })
    );

    const timestamp = new Date().toISOString();
    const isNewUser = !existing.Item;

    const userData = {
      ...(existing.Item ?? {}),
      userId,
      email,
      signInCompleted: true,
      createdAt: existing.Item?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: userData }));

    return NextResponse.json({
      success: true,
      userId,
      email,
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
