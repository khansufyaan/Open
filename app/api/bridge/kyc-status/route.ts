import { NextResponse } from "next/server";

import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

import {
  getKycLink,
  isKycApproved,
  createWallet,
  isBridgeConfigured,
  BridgeRequestError,
} from "@/lib/bridge/server";
import { handleBridgeError } from "@/lib/bridge/route-helpers";
import { docClient, USERS_TABLE as TABLE_NAME } from "@/lib/db/dynamo";

const DEMO_AUTOAPPROVE = process.env.BRIDGE_DEMO_AUTOAPPROVE === "true";

/**
 * Reads the authoritative KYC result from Bridge for a user.
 *
 * On first observed approval this also provisions the user's custodial Bridge
 * wallet and marks the user verified. Verification status is never accepted
 * from the client — it is read back from Bridge's KYC link object.
 */
export async function GET(request: Request) {
  const userId = new URL(request.url).searchParams.get("userId");

  if (!userId) {
    return NextResponse.json(
      { error: "MISSING_USER_ID", message: "userId query parameter is required." },
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
      walletAddress: user.walletAddress ?? null,
    });
  }

  if (!isBridgeConfigured()) {
    if (DEMO_AUTOAPPROVE) {
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
      return NextResponse.json({ verified: true, kycStatus: "approved", demo: true, walletAddress: null });
    }
    return NextResponse.json(
      { error: "BRIDGE_NOT_CONFIGURED", message: "Bridge API key is missing on the server." },
      { status: 500 }
    );
  }

  const kycLinkId = typeof user.bridgeKycLinkId === "string" ? user.bridgeKycLinkId : null;

  if (!kycLinkId) {
    return NextResponse.json({ verified: false, kycStatus: "not_started", walletAddress: null });
  }

  try {
    const link = await getKycLink(kycLinkId);
    const approved = isKycApproved(link);

    if (!approved) {
      return NextResponse.json({
        verified: false,
        kycStatus: link.kyc_status,
        walletAddress: null,
      });
    }

    const customerId =
      link.customer_id ?? (typeof user.bridgeCustomerId === "string" ? user.bridgeCustomerId : undefined);

    let walletId = typeof user.walletId === "string" ? user.walletId : undefined;
    let walletAddress = typeof user.walletAddress === "string" ? user.walletAddress : undefined;
    let bridgeWarning: string | null = null;

    if (customerId && (!walletId || !walletAddress)) {
      try {
        const wallet = await createWallet({
          customerId,
          tags: [`user:${userId}`],
          idempotencyKey: `wallet:${userId}`,
        });
        walletId = wallet.id;
        walletAddress = wallet.address;
      } catch (error) {
        bridgeWarning =
          error instanceof BridgeRequestError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Bridge wallet provisioning failed.";
        console.error("[Bridge KYC Status] Wallet provisioning failed:", error);
      }
    }

    const timestamp = new Date().toISOString();

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
          walletId,
          walletAddress,
          walletCreated: Boolean(walletId),
          updatedAt: timestamp,
        },
      })
    );

    return NextResponse.json({
      verified: true,
      kycStatus: link.kyc_status,
      walletAddress: walletAddress ?? null,
      bridgeWarning,
    });
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
