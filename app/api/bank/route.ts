import { NextResponse } from "next/server";

import { getUser } from "@/lib/db/store";
import { requireAuth } from "@/lib/auth/privy";
import { enforceRateLimit } from "@/lib/ratelimit";
import { recordAudit } from "@/lib/audit";
import { captureError } from "@/lib/observability";
import { handleBridgeError } from "@/lib/bridge/route-helpers";
import { BridgeRequestError } from "@/lib/bridge/server";
import { linkBankAccount } from "@/lib/bridge/offramp";
import { isValidAccountNumber, isValidRoutingNumber } from "@/lib/validation";

/** Links a fiat bank account for cash-out (burn). */
export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const userId = auth.userId;

  const limited = await enforceRateLimit("default", userId);
  if (limited) return limited;

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const { accountHolder, accountNumber, routingNumber, bankName } = (body ?? {}) as {
    accountHolder?: string;
    accountNumber?: string;
    routingNumber?: string;
    bankName?: string;
  };

  if (typeof accountHolder !== "string" || accountHolder.trim().length < 2) {
    return NextResponse.json(
      { error: "INVALID_NAME", message: "Enter the account holder name." },
      { status: 400 }
    );
  }
  if (!isValidAccountNumber(accountNumber)) {
    return NextResponse.json(
      { error: "INVALID_ACCOUNT", message: "Enter a valid account number (4–17 digits)." },
      { status: 400 }
    );
  }
  if (!isValidRoutingNumber(routingNumber)) {
    return NextResponse.json(
      { error: "INVALID_ROUTING", message: "Enter a valid 9-digit routing number." },
      { status: 400 }
    );
  }

  const user = await getUser(userId);
  if (!user) {
    return NextResponse.json({ error: "USER_NOT_FOUND", message: "Sign in first." }, { status: 404 });
  }
  if (!user.onboardingCompleted) {
    return NextResponse.json(
      { error: "NOT_ONBOARDED", message: "Finish onboarding before linking a bank." },
      { status: 409 }
    );
  }

  try {
    const account = await linkBankAccount(user, {
      accountHolder: accountHolder.trim(),
      accountNumber: accountNumber.trim(),
      routingNumber: routingNumber.trim(),
      bankName: bankName?.trim() || undefined,
    });
    await recordAudit({
      userId,
      action: "bank.linked",
      detail: { last4: account.last4, source: account.source },
    });
    return NextResponse.json({ success: true, externalAccount: account });
  } catch (error) {
    if (error instanceof BridgeRequestError) return handleBridgeError(error, "LinkBank");
    captureError("LinkBank", error, { userId });
    return NextResponse.json(
      { error: "LINK_FAILED", message: "Unable to link bank account." },
      { status: 500 }
    );
  }
}
