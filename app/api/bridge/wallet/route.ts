import { NextResponse } from "next/server";

import { createWallet, listWallets, isBridgeConfigured } from "@/lib/bridge/server";
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
    const wallets = await listWallets(customerId);
    return NextResponse.json({ wallets });
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
    body = null;
  }

  const { customerId, chain, tags } = (body ?? {}) as {
    customerId?: string;
    chain?: string;
    tags?: string[];
  };

  if (!customerId) {
    return NextResponse.json(
      { error: "MISSING_CUSTOMER_ID", message: "customerId is required to create a wallet." },
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
    const wallet = await createWallet({ customerId, chain, tags });
    return NextResponse.json({ wallet });
  } catch (error) {
    return handleBridgeError(error);
  }
}
