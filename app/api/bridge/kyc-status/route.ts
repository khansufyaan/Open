import { NextResponse } from "next/server";

import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

import {
  getKycLink,
  isKycApproved,
  isBridgeConfigured,
  BridgeRequestError,
} from "@/lib/bridge/server";
import { handleBridgeError, isDemoAutoApprove } from "@/lib/bridge/route-helpers";
import { docClient, USERS_TABLE as TABLE_NAME } from "@/lib/db/dynamo";
import { requireAuth } from "@/lib/auth/privy";

/**
 * Reads the authoritative KYC result from Bridge for a user and records the
 * verified state. Funds are withdrawn directly from the company vault, so no
 * per-user wallet is provisioned here. Verification status is never accepted
 * from the client — it is read back from Bridge's KYC link object.
 */
export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }
  const userId = auth.userId;

  let user: Record<string, unknown>;

  try {
    const existing = await docClient.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { userId } })
    );
    if (!existing.Item) {
      return NextResponse.json(
        { error: "USER_NOT_FOUND", message: "Sign in before checking verification." },
        { status: 404 }
      );
    }
    user = existing.Item as Record<string, unknown>;
  } catch (error) {
    console.error("[Bridge KYC Status] Failed to load user:", error);
    return NextResponse.json(
      { error: "USER_LOOKUP_FAILED", message: "Unable to load user record." },
      { status: 500 }
    );
  }

  // Already verified — short-circuit.
  if (user.personaVerificationCompleted) {
    return NextResponse.json({
      verified: true,
      kycStatus: typeof user.kycStatus === "string" ? user.kycStatus : "approved",
    });
  }

  if (!isBridgeConfigured()) {
    if (isDemoAutoApprove()) {
      const timestamp = new Date().toISOString();
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            ...user,
            userId,
            kycStatus: "approved",
            kycVerificationSource: "demo",
            personaVerificationCompleted: true,
            personaVerifiedAt: timestamp,
            updatedAt: timestamp,
          },
        })
      );
      return NextResponse.json({ verified: true, kycStatus: "approved", demo: true });
    }
    return NextResponse.json(
      { error: "BRIDGE_NOT_CONFIGURED", message: "Bridge API key is missing on the server." },
      { status: 500 }
    );
  }

  const kycLinkId = typeof user.bridgeKycLinkId === "string" ? user.bridgeKycLinkId : null;

  if (!kycLinkId) {
    return NextResponse.json({ verified: false, kycStatus: "not_started" });
  }

  try {
    const link = await getKycLink(kycLinkId);
    const approved = isKycApproved(link);

    if (!approved) {
      return NextResponse.json({ verified: false, kycStatus: link.kyc_status });
    }

    const customerId =
      link.customer_id ?? (typeof user.bridgeCustomerId === "string" ? user.bridgeCustomerId : undefined);

    const timestamp = new Date().toISOString();

    try {
      // Only the first concurrent poll commits the approval, so a later poll
      // can't overwrite fields written by the first.
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            ...user,
            userId,
            bridgeCustomerId: customerId,
            kycStatus: link.kyc_status,
            kycVerificationSource: "bridge",
            personaVerificationCompleted: true,
            personaVerifiedAt: timestamp,
            updatedAt: timestamp,
          },
          ConditionExpression:
            "attribute_not_exists(personaVerificationCompleted) OR personaVerificationCompleted <> :verified",
          ExpressionAttributeValues: { ":verified": true },
        })
      );
    } catch (error) {
      // Another concurrent poll already recorded the approval — that's fine.
      if (!(error instanceof Error && error.name === "ConditionalCheckFailedException")) {
        throw error;
      }
    }

    return NextResponse.json({ verified: true, kycStatus: link.kyc_status });
  } catch (error) {
    if (error instanceof BridgeRequestError) {
      return handleBridgeError(error, "Bridge KYC Status");
    }

    console.error("[Bridge KYC Status] Failed to read KYC status:", error);
    return NextResponse.json(
      { error: "KYC_STATUS_FAILED", message: "Unable to read verification status." },
      { status: 500 }
    );
  }
}
