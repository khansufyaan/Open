import { NextResponse } from "next/server";

import { getUser } from "@/lib/db/store";
import { requireAuth } from "@/lib/auth/privy";
import { enforceRateLimit } from "@/lib/ratelimit";
import { recordAudit } from "@/lib/audit";
import { captureError } from "@/lib/observability";
import {
  setAutoSwapTarget,
  sweepToTarget,
  isSupportedTarget,
  SUPPORTED_TARGET_CURRENCIES,
} from "@/lib/bridge/autoswap";

/**
 * Sets the user's preferred stablecoin. From then on, any other stablecoin that
 * lands in their single wallet address is auto-converted to it (server-side, no
 * approval). We also kick an immediate sweep in case they already hold others.
 */
export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) {
    return auth;
  }
  const userId = auth.userId;

  const limited = await enforceRateLimit("default", userId);
  if (limited) return limited;

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const { currency } = (body ?? {}) as { currency?: string };

  if (typeof currency !== "string" || !isSupportedTarget(currency)) {
    return NextResponse.json(
      {
        error: "INVALID_CURRENCY",
        message: `Choose a supported stablecoin: ${SUPPORTED_TARGET_CURRENCIES.join(", ").toUpperCase()}.`,
      },
      { status: 400 }
    );
  }

  const user = await getUser(userId);
  if (!user) {
    return NextResponse.json(
      { error: "USER_NOT_FOUND", message: "Sign in first." },
      { status: 404 }
    );
  }
  if (!user.onboardingCompleted || !user.walletAddress) {
    return NextResponse.json(
      { error: "NOT_ONBOARDED", message: "Finish onboarding before setting auto-convert." },
      { status: 409 }
    );
  }

  try {
    const config = await setAutoSwapTarget(user, currency);
    await recordAudit({
      userId,
      action: "autoswap.set",
      detail: { target: config.targetCurrency, source: config.source },
    });
    // Convert anything already sitting in the wallet (best-effort).
    const converted = await sweepToTarget({ ...user, autoSwap: config });
    return NextResponse.json({ success: true, autoSwap: config, converted });
  } catch (error) {
    captureError("AutoSwap", error, { userId });
    return NextResponse.json(
      { error: "AUTOSWAP_FAILED", message: "Unable to set auto-convert." },
      { status: 500 }
    );
  }
}
