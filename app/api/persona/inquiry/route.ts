import { NextResponse } from "next/server";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

import {
  createCustomer,
  createWallet,
  isBridgeConfigured,
  BridgeRequestError,
} from "@/lib/bridge/server";

const TABLE_NAME = "blue-wallet-users";

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-2",
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);

const PASSING_STATUSES = new Set(["completed", "approved", "passed"]);

const PERSONA_API_BASE_URL = process.env.PERSONA_API_BASE_URL ?? "https://withpersona.com/api/v1";

/**
 * Fetches the authoritative inquiry status directly from Persona so we never
 * trust a client-supplied `status`. Returns null when PERSONA_API_KEY is not
 * configured (demo mode) or the lookup fails — callers then fall back to the
 * client value and flag the result as unverified.
 */
async function fetchPersonaInquiryStatus(inquiryId: string): Promise<string | null> {
  const apiKey = process.env.PERSONA_API_KEY;

  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch(`${PERSONA_API_BASE_URL}/inquiries/${encodeURIComponent(inquiryId)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "Persona-Version": process.env.PERSONA_API_VERSION ?? "2023-01-05",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      console.error(`[Persona Inquiry] Server verification failed (${response.status}).`);
      return null;
    }

    const data = (await response.json()) as {
      data?: { attributes?: { status?: string } };
    };

    return data.data?.attributes?.status?.toLowerCase() ?? null;
  } catch (error) {
    console.error("[Persona Inquiry] Server verification error:", error);
    return null;
  }
}

/**
 * Records the outcome of a Persona identity verification inquiry.
 *
 * On a passing inquiry this also provisions the user's Bridge customer and a
 * custodial Bridge wallet (best effort — the session still proceeds in demo
 * mode when Bridge credentials are absent).
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

  const { userId, inquiryId, status, fields } = (body ?? {}) as {
    userId?: string;
    inquiryId?: string;
    status?: string;
    fields?: Record<string, unknown>;
  };

  if (!userId) {
    return NextResponse.json(
      { error: "MISSING_USER_ID", message: "userId is required." },
      { status: 400 }
    );
  }

  if (!inquiryId) {
    return NextResponse.json(
      { error: "MISSING_INQUIRY_ID", message: "inquiryId is required." },
      { status: 400 }
    );
  }

  // Prefer the status reported directly by Persona's API over the client value.
  const verifiedStatus = await fetchPersonaInquiryStatus(inquiryId);
  const verificationSource = verifiedStatus ? "persona_api" : "client";
  const normalizedStatus = verifiedStatus ?? (status ?? "").toLowerCase();
  const passed = PASSING_STATUSES.has(normalizedStatus);

  try {
    const existing = await docClient.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { userId } })
    );

    if (!existing.Item) {
      return NextResponse.json(
        { error: "USER_NOT_FOUND", message: "Sign in before completing verification." },
        { status: 404 }
      );
    }

    const user = existing.Item as Record<string, unknown>;
    const email = typeof user.email === "string" ? user.email : undefined;
    const fullName =
      typeof (fields?.["name-first"] ?? fields?.["nameFirst"]) === "string"
        ? `${fields?.["name-first"] ?? fields?.["nameFirst"]} ${fields?.["name-last"] ?? fields?.["nameLast"] ?? ""}`.trim()
        : undefined;

    let bridgeCustomerId = typeof user.bridgeCustomerId === "string" ? user.bridgeCustomerId : undefined;
    let walletId = typeof user.walletId === "string" ? user.walletId : undefined;
    let walletAddress = typeof user.walletAddress === "string" ? user.walletAddress : undefined;
    let bridgeWarning: string | null = null;

    if (passed && isBridgeConfigured() && email) {
      try {
        if (!bridgeCustomerId) {
          const customer = await createCustomer({
            email,
            fullName,
            personaInquiryId: inquiryId,
          });
          bridgeCustomerId = customer.id;
        }

        if (bridgeCustomerId && (!walletId || !walletAddress)) {
          const wallet = await createWallet({
            customerId: bridgeCustomerId,
            tags: [`user:${userId}`],
          });
          walletId = wallet.id;
          walletAddress = wallet.address;
        }
      } catch (error) {
        // Don't fail verification if Bridge provisioning hiccups; surface a warning.
        bridgeWarning =
          error instanceof BridgeRequestError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Bridge provisioning failed.";
        console.error("[Persona Inquiry] Bridge provisioning failed:", error);
      }
    }

    const timestamp = new Date().toISOString();

    const updated = {
      ...user,
      userId,
      personaInquiryId: inquiryId,
      personaStatus: normalizedStatus || "unknown",
      personaVerificationSource: verificationSource,
      personaVerificationCompleted: passed,
      personaVerifiedAt: passed ? timestamp : user.personaVerifiedAt,
      bridgeCustomerId,
      walletId,
      walletAddress,
      walletCreated: Boolean(walletId),
      updatedAt: timestamp,
    };

    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }));

    return NextResponse.json({
      success: true,
      verified: passed,
      personaStatus: updated.personaStatus,
      verificationSource,
      bridgeCustomerId,
      walletId,
      walletAddress,
      bridgeWarning,
    });
  } catch (error) {
    console.error("[Persona Inquiry] Failed to record inquiry:", error);
    return NextResponse.json(
      {
        error: "PERSONA_INQUIRY_FAILED",
        message: error instanceof Error ? error.message : "Unable to record verification.",
      },
      { status: 500 }
    );
  }
}
