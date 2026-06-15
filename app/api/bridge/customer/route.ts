import { NextResponse } from "next/server";

import { createCustomer, getCustomer, isBridgeConfigured } from "@/lib/bridge/server";
import { bridgeNotConfigured, handleBridgeError } from "@/lib/bridge/route-helpers";
import { verifyAuth, unauthorized } from "@/lib/auth/privy";
import { userOwnsBridgeCustomer } from "@/lib/auth/authorize";

export async function GET(request: Request) {
  if (!isBridgeConfigured()) {
    return bridgeNotConfigured();
  }

  const auth = await verifyAuth(request);
  if (!auth) {
    return unauthorized();
  }

  const customerId = new URL(request.url).searchParams.get("customerId");

  if (!customerId) {
    return NextResponse.json(
      { error: "MISSING_CUSTOMER_ID", message: "customerId query parameter is required." },
      { status: 400 }
    );
  }

  if (!(await userOwnsBridgeCustomer(auth.userId, customerId))) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: "This customer does not belong to you." },
      { status: 403 }
    );
  }

  try {
    const customer = await getCustomer(customerId);
    return NextResponse.json({ customer });
  } catch (error) {
    return handleBridgeError(error);
  }
}

export async function POST(request: Request) {
  if (!isBridgeConfigured()) {
    return bridgeNotConfigured();
  }

  const auth = await verifyAuth(request);
  if (!auth) {
    return unauthorized();
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON", message: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const { email, fullName, personaInquiryId } = (body ?? {}) as {
    email?: string;
    fullName?: string;
    personaInquiryId?: string;
  };

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "INVALID_EMAIL", message: "A valid email is required to create a Bridge customer." },
      { status: 400 }
    );
  }

  try {
    const customer = await createCustomer({ email, fullName, personaInquiryId });
    return NextResponse.json({ customer });
  } catch (error) {
    return handleBridgeError(error);
  }
}
