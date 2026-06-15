import { NextResponse } from "next/server";

import {
  getKycLink,
  isKycApproved,
  isBridgeConfigured,
  BridgeRequestError,
} from "@/lib/bridge/server";
import { handleBridgeError, isDemoAutoApprove } from "@/lib/bridge/route-helpers";
import { getUser, updateUser } from "@/lib/db/store";
import { ensureProvisioned } from "@/lib/bridge/provision";
import { requireAuth } from "@/lib/auth/privy";

/**
 * Reads the authoritative KYC result from Bridge for a user and, on approval,
 * provisions the user's Bridge wallet + virtual account. Verification status is
 * never accepted from the client — it is read back from Bridge's KYC link.
 */
export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }
  const userId = auth.userId;

  let user = await getUser(userId);
  if (!user) {
    return NextResponse.json(
      { error: "USER_NOT_FOUND", message: "Sign in before checking verification." },
      { status: 404 }
    );
  }

  // Already verified — ensure provisioning is complete and short-circuit.
  if (user.personaVerificationCompleted) {
    try {
      user = await ensureProvisioned(user);
    } catch (error) {
      console.error("[Bridge KYC Status] Provisioning after verification failed:", error);
    }
    return NextResponse.json({
      verified: true,
      kycStatus: user.kycStatus ?? "approved",
      onboardingCompleted: Boolean(user.onboardingCompleted),
    });
  }

  if (!isBridgeConfigured()) {
    if (isDemoAutoApprove()) {
      const timestamp = new Date().toISOString();
      user = await updateUser(userId, {
        kycStatus: "approved",
        kycVerificationSource: "demo",
        personaVerificationCompleted: true,
        personaVerifiedAt: timestamp,
      });
      user = await ensureProvisioned(user);
      return NextResponse.json({
        verified: true,
        kycStatus: "approved",
        demo: true,
        onboardingCompleted: Boolean(user.onboardingCompleted),
      });
    }
    return NextResponse.json(
      { error: "BRIDGE_NOT_CONFIGURED", message: "Bridge API key is missing on the server." },
      { status: 500 }
    );
  }

  const kycLinkId = user.bridgeKycLinkId ?? null;
  if (!kycLinkId) {
    return NextResponse.json({ verified: false, kycStatus: "not_started" });
  }

  try {
    const link = await getKycLink(kycLinkId);
    const approved = isKycApproved(link);

    if (!approved) {
      await updateUser(userId, { kycStatus: link.kyc_status });
      return NextResponse.json({ verified: false, kycStatus: link.kyc_status });
    }

    const timestamp = new Date().toISOString();
    user = await updateUser(userId, {
      bridgeCustomerId: link.customer_id ?? user.bridgeCustomerId,
      kycStatus: link.kyc_status,
      kycVerificationSource: "bridge",
      personaVerificationCompleted: true,
      personaVerifiedAt: timestamp,
    });

    // Provision wallet + virtual account now that the customer is approved.
    user = await ensureProvisioned(user);

    return NextResponse.json({
      verified: true,
      kycStatus: link.kyc_status,
      onboardingCompleted: Boolean(user.onboardingCompleted),
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
