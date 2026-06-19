import { NextResponse } from "next/server";

import { getUser, updateUser } from "@/lib/db/store";
import { requireAuth, getPrivyEmail } from "@/lib/auth/privy";

/**
 * Establishes (upserts) the app user record for the authenticated Privy user.
 *
 * The userId is the verified Privy DID — it is never derived from request
 * input. Identity is verified separately via Bridge-hosted KYC before any
 * wallet / virtual account capability is unlocked (see /api/portal).
 */
export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const userId = auth.userId;

  try {
    const existing = await getUser(userId);
    const email = (await getPrivyEmail(userId)) ?? existing?.email;
    const isNewUser = !existing;

    const user = await updateUser(userId, {
      ...(email ? { email } : {}),
      signInCompleted: true,
    });

    return NextResponse.json({
      success: true,
      userId,
      email: user.email ?? null,
      personaVerificationCompleted: Boolean(user.personaVerificationCompleted),
      onboardingCompleted: Boolean(user.onboardingCompleted),
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
