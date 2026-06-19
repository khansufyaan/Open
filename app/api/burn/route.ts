import { NextResponse } from "next/server";

import { getUser } from "@/lib/db/store";
import { requireAuth } from "@/lib/auth/privy";
import { enforceRateLimit } from "@/lib/ratelimit";
import { captureError } from "@/lib/observability";
import { handleBridgeError } from "@/lib/bridge/route-helpers";
import { BridgeRequestError } from "@/lib/bridge/server";
import { burnToFiat } from "@/lib/bridge/offramp";
import { isSupportedTarget } from "@/lib/bridge/autoswap";
import { isValidAmount, isValidRequestId } from "@/lib/validation";

/** Cash out / burn: convert a stablecoin to USD and pay out to the linked bank. */
export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.userId;

  const limited = await enforceRateLimit("send", userId);
  if (limited) return limited;

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const { currency, amount, requestId } = (body ?? {}) as {
    currency?: string;
    amount?: string;
    requestId?: string;
  };

  if (typeof currency !== "string" || !isSupportedTarget(currency)) {
    return NextResponse.json(
      { error: "INVALID_CURRENCY", message: "Choose a supported stablecoin." },
      { status: 400 }
    );
  }
  if (!isValidAmount(amount)) {
    return NextResponse.json(
      { error: "INVALID_AMOUNT", message: "Enter a valid amount." },
      { status: 400 }
    );
  }

  const user = await getUser(userId);
  if (!user) {
    return NextResponse.json({ error: "USER_NOT_FOUND", message: "Sign in first." }, { status: 404 });
  }
  if (!user.onboardingCompleted || !user.walletAddress) {
    return NextResponse.json(
      { error: "NOT_ONBOARDED", message: "Finish onboarding before cashing out." },
      { status: 409 }
    );
  }
  if (!user.externalAccount) {
    return NextResponse.json(
      { error: "NO_BANK", message: "Link a bank account before cashing out." },
      { status: 409 }
    );
  }

  try {
    const result = await burnToFiat(user, {
      currency,
      amount: amount.trim(),
      requestId: isValidRequestId(requestId) ? requestId : undefined,
    });
    return NextResponse.json({
      success: true,
      demo: Boolean(result.demo),
      transaction: result.transaction,
    });
  } catch (error) {
    if (error instanceof BridgeRequestError) return handleBridgeError(error, "Burn");
    captureError("Burn", error, { userId });
    return NextResponse.json(
      { error: "BURN_FAILED", message: "Unable to cash out." },
      { status: 500 }
    );
  }
}
