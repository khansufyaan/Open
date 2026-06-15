import { NextResponse } from "next/server";

import {
  createCustomer,
  getCustomer,
  getCustomerKycStatus,
  isCustomerApproved,
  isBridgeConfigured,
  BridgeRequestError,
} from "@/lib/bridge/server";
import { handleBridgeError, isDemoAutoApprove } from "@/lib/bridge/route-helpers";
import { getUser, updateUser } from "@/lib/db/store";
import { ensureProvisioned } from "@/lib/bridge/provision";
import { requireAuth } from "@/lib/auth/privy";

const INQUIRY_REGEX = /^inq_[A-Za-z0-9]+$/;

/**
 * Ingests a completed embedded-Persona inquiry into Bridge.
 *
 * The client runs Persona inline (Persona SDK) and posts the resulting
 * inquiryId here. We create/reuse the Bridge customer with that inquiry, then
 * read the authoritative KYC status back from Bridge — the client's reported
 * status is never trusted. On approval we provision the wallet + virtual
 * account.
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

  const { inquiryId } = (body ?? {}) as { inquiryId?: string };
  if (typeof inquiryId !== "string" || !INQUIRY_REGEX.test(inquiryId)) {
    return NextResponse.json(
      { error: "INVALID_INQUIRY", message: "A valid Persona inquiry id is required." },
      { status: 400 }
    );
  }

  let user = await getUser(userId);
  if (!user) {
    return NextResponse.json(
      { error: "USER_NOT_FOUND", message: "Sign in before verifying." },
      { status: 404 }
    );
  }

  // --- Demo mode (no Bridge credentials): approve + provision directly ---
  if (!isBridgeConfigured()) {
    if (isDemoAutoApprove()) {
      const timestamp = new Date().toISOString();
      user = await updateUser(userId, {
        personaInquiryId: inquiryId,
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

  if (!user.email) {
    return NextResponse.json(
      { error: "MISSING_EMAIL", message: "User record has no email on file." },
      { status: 409 }
    );
  }

  try {
    // Create (or reuse) the Bridge customer from the completed Persona inquiry.
    let customerId = user.bridgeCustomerId;
    if (!customerId) {
      const customer = await createCustomer({
        email: user.email,
        fullName: user.fullName,
        personaInquiryId: inquiryId,
        idempotencyKey: `customer-${userId}`,
      });
      customerId = customer.id;
    }

    // Read authoritative KYC status back from Bridge.
    const customer = await getCustomer(customerId);
    const approved = isCustomerApproved(customer);
    const kycStatus = getCustomerKycStatus(customer);

    user = await updateUser(userId, {
      bridgeCustomerId: customerId,
      personaInquiryId: inquiryId,
      kycStatus,
      kycVerificationSource: "bridge",
    });

    if (!approved) {
      return NextResponse.json({ verified: false, kycStatus });
    }

    user = await updateUser(userId, {
      personaVerificationCompleted: true,
      personaVerifiedAt: new Date().toISOString(),
    });
    user = await ensureProvisioned(user);

    return NextResponse.json({
      verified: true,
      kycStatus,
      onboardingCompleted: Boolean(user.onboardingCompleted),
    });
  } catch (error) {
    if (error instanceof BridgeRequestError) {
      return handleBridgeError(error, "Bridge KYC Inquiry");
    }
    console.error("[Bridge KYC Inquiry] Failed to process inquiry:", error);
    return NextResponse.json(
      { error: "KYC_INQUIRY_FAILED", message: "Unable to verify your identity." },
      { status: 500 }
    );
  }
}
