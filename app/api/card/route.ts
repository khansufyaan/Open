import { NextResponse } from "next/server";

import { getUser } from "@/lib/db/store";
import { issueCard } from "@/lib/bridge/cards";
import { requireAuth } from "@/lib/auth/privy";

/**
 * Issues (or returns) a stablecoin-backed card for the authenticated user.
 * Real Bridge issuance when available; otherwise a labeled demo card.
 */
export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }
  const userId = auth.userId;

  const user = await getUser(userId);
  if (!user) {
    return NextResponse.json(
      { error: "USER_NOT_FOUND", message: "Sign in first." },
      { status: 404 }
    );
  }

  if (!user.onboardingCompleted || !user.walletAddress) {
    return NextResponse.json(
      { error: "NOT_ONBOARDED", message: "Finish onboarding before issuing a card." },
      { status: 409 }
    );
  }

  try {
    const result = await issueCard(user);
    return NextResponse.json({ success: true, card: result.card, note: result.note ?? null });
  } catch (error) {
    console.error("[Card] Failed to issue card:", error);
    return NextResponse.json(
      { error: "CARD_FAILED", message: "Unable to issue a card." },
      { status: 500 }
    );
  }
}
