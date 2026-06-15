import { NextResponse } from "next/server";

import { getUser, updateUser } from "@/lib/db/store";
import { provisionDemo } from "@/lib/bridge/provision";
import { requireAuth } from "@/lib/auth/privy";

/**
 * Lets a user skip identity verification and still reach a working dashboard.
 * Provisions a clearly-labeled demo wallet + virtual account so testers can see
 * Receive/Send/Card. Identity is NOT marked verified — the reminder to complete
 * KYC stays, and finishing KYC later upgrades the demo resources to real ones.
 */
export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }
  const userId = auth.userId;

  try {
    const existing = await getUser(userId);
    if (!existing) {
      return NextResponse.json(
        { error: "USER_NOT_FOUND", message: "Sign in first." },
        { status: 404 }
      );
    }

    // Already verified — nothing to demo-provision.
    if (existing.personaVerificationCompleted) {
      return NextResponse.json({ success: true, alreadyVerified: true });
    }

    let user = await updateUser(userId, { skippedOnboarding: true });
    user = await provisionDemo(user);

    return NextResponse.json({ success: true, onboardingCompleted: Boolean(user.onboardingCompleted) });
  } catch (error) {
    console.error("[Onboarding Skip] Failed:", error);
    return NextResponse.json(
      { error: "SKIP_FAILED", message: "Unable to skip onboarding." },
      { status: 500 }
    );
  }
}
