import { NextResponse } from "next/server";

import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

import {
  createKycLink,
  getKycLink,
  isBridgeConfigured,
  BridgeRequestError,
} from "@/lib/bridge/server";
import { docClient, USERS_TABLE as TABLE_NAME } from "@/lib/db/dynamo";

const DEMO_AUTOAPPROVE = process.env.BRIDGE_DEMO_AUTOAPPROVE === "true";

/**
 * Starts (or resumes) Bridge's hosted Persona KYC flow for a user.
 *
 * Returns a short-lived `bridge.withpersona.com` URL the client opens. The
 * verified result is read back authoritatively via GET /api/bridge/kyc-status.
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

  const { userId, fullName } = (body ?? {}) as { userId?: string; fullName?: string };

  if (!userId) {
    return NextResponse.json(
      { error: "MISSING_USER_ID", message: "userId is required." },
      { status: 400 }
    );
  }

  let user: Record<string, unknown>;

  try {
    const existing = await docClient.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { userId } })
    );
    if (!existing.Item) {
      return NextResponse.json(
        { error: "USER_NOT_FOUND", message: "Sign in before starting verification." },
        { status: 404 }
      );
    }
    user = existing.Item as Record<string, unknown>;
  } catch (error) {
    console.error("[Bridge KYC Link] Failed to load user:", error);
    return NextResponse.json(
      { error: "USER_LOOKUP_FAILED", message: "Unable to load user record." },
      { status: 500 }
    );
  }

  const email = typeof user.email === "string" ? user.email : undefined;

  if (!isBridgeConfigured()) {
    if (DEMO_AUTOAPPROVE) {
      // Local demo without Bridge credentials: no hosted flow to open.
      return NextResponse.json({ demo: true, kycStatus: "not_started", url: null });
    }
    return NextResponse.json(
      {
        error: "BRIDGE_NOT_CONFIGURED",
        message: "Bridge API key is missing on the server. Set BRIDGE_API_KEY.",
      },
      { status: 500 }
    );
  }

  if (!email) {
    return NextResponse.json(
      { error: "MISSING_EMAIL", message: "User record has no email on file." },
      { status: 409 }
    );
  }

  try {
    const existingLinkId = typeof user.bridgeKycLinkId === "string" ? user.bridgeKycLinkId : null;

    // Reuse an in-flight KYC link rather than creating a new one each time.
    if (existingLinkId) {
      const existingLink = await getKycLink(existingLinkId);
      return NextResponse.json({
        url: existingLink.kyc_link,
        tosLink: existingLink.tos_link ?? null,
        kycStatus: existingLink.kyc_status,
        tosStatus: existingLink.tos_status ?? null,
      });
    }

    const redirectUri = process.env.BRIDGE_KYC_REDIRECT_URI;

    const link = await createKycLink({
      email,
      fullName: fullName || (typeof user.plaidVerifiedName === "string" ? user.plaidVerifiedName : email),
      redirectUri,
    });

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...user,
          userId,
          bridgeKycLinkId: link.id,
          bridgeCustomerId: link.customer_id ?? user.bridgeCustomerId,
          kycLinkUrl: link.kyc_link,
          updatedAt: new Date().toISOString(),
        },
      })
    );

    return NextResponse.json({
      url: link.kyc_link,
      tosLink: link.tos_link ?? null,
      kycStatus: link.kyc_status,
      tosStatus: link.tos_status ?? null,
    });
  } catch (error) {
    if (error instanceof BridgeRequestError) {
      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details ?? null },
        { status: error.status >= 400 && error.status < 600 ? error.status : 502 }
      );
    }

    console.error("[Bridge KYC Link] Failed to create KYC link:", error);
    return NextResponse.json(
      { error: "KYC_LINK_FAILED", message: "Unable to start identity verification." },
      { status: 500 }
    );
  }
}
