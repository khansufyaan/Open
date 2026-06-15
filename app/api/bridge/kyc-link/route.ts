import { NextResponse } from "next/server";

import {
  createKycLink,
  getKycLink,
  isBridgeConfigured,
  BridgeRequestError,
} from "@/lib/bridge/server";
import { handleBridgeError, isDemoAutoApprove } from "@/lib/bridge/route-helpers";
import { getUser, updateUser } from "@/lib/db/store";
import { requireAuth } from "@/lib/auth/privy";

// Bridge KYC links are short-lived; refresh rather than hand back a dead URL.
const KYC_LINK_TTL_MS = 30 * 60 * 1000;

/**
 * Starts (or resumes) Bridge's hosted Persona KYC flow for a user.
 *
 * Returns a short-lived `bridge.withpersona.com` URL the client opens. The
 * verified result is read back authoritatively via GET /api/bridge/kyc-status.
 */
export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }
  const userId = auth.userId;

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const { fullName } = (body ?? {}) as { fullName?: string };

  const user = await getUser(userId);
  if (!user) {
    return NextResponse.json(
      { error: "USER_NOT_FOUND", message: "Sign in before starting verification." },
      { status: 404 }
    );
  }

  const email = user.email;

  if (!isBridgeConfigured()) {
    if (isDemoAutoApprove()) {
      // Local/demo without Bridge credentials: no hosted flow to open.
      if (fullName && fullName !== user.fullName) {
        await updateUser(userId, { fullName });
      }
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
    const existingLinkId = user.bridgeKycLinkId ?? null;

    // Reuse an in-flight KYC link only while it's still fresh; otherwise mint a
    // new one so the client never opens an expired URL.
    if (existingLinkId) {
      try {
        const existingLink = await getKycLink(existingLinkId);
        const createdAt = existingLink.created_at ? Date.parse(existingLink.created_at) : NaN;
        const ageMs = Number.isFinite(createdAt)
          ? Date.now() - createdAt
          : Number.POSITIVE_INFINITY;

        if (ageMs < KYC_LINK_TTL_MS) {
          return NextResponse.json({
            url: existingLink.kyc_link,
            tosLink: existingLink.tos_link ?? null,
            kycStatus: existingLink.kyc_status,
            tosStatus: existingLink.tos_status ?? null,
          });
        }
      } catch (error) {
        console.warn("[Bridge KYC Link] Could not reuse existing link, creating a new one:", error);
      }
    }

    const redirectUri = process.env.BRIDGE_KYC_REDIRECT_URI;

    const link = await createKycLink({
      email,
      fullName: fullName || user.fullName || email,
      redirectUri,
    });

    await updateUser(userId, {
      ...(fullName ? { fullName } : {}),
      bridgeKycLinkId: link.id,
      bridgeCustomerId: link.customer_id ?? user.bridgeCustomerId,
      kycLinkUrl: link.kyc_link,
      kycStatus: link.kyc_status,
    });

    return NextResponse.json({
      url: link.kyc_link,
      tosLink: link.tos_link ?? null,
      kycStatus: link.kyc_status,
      tosStatus: link.tos_status ?? null,
    });
  } catch (error) {
    if (error instanceof BridgeRequestError) {
      return handleBridgeError(error, "Bridge KYC Link");
    }

    console.error("[Bridge KYC Link] Failed to create KYC link:", error);
    return NextResponse.json(
      { error: "KYC_LINK_FAILED", message: "Unable to start identity verification." },
      { status: 500 }
    );
  }
}
