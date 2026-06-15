import { NextResponse } from "next/server";

import {
  createWallet,
  listWallets,
  isBridgeConfigured,
  BridgeRequestError,
} from "@/lib/bridge/server";

function bridgeNotConfigured() {
  return NextResponse.json(
    {
      error: "BRIDGE_NOT_CONFIGURED",
      message: "Bridge API key is missing on the server. Set BRIDGE_API_KEY.",
    },
    { status: 500 }
  );
}

function handleBridgeError(error: unknown) {
  if (error instanceof BridgeRequestError) {
    return NextResponse.json(
      { error: error.code, message: error.message, details: error.details ?? null },
      { status: error.status >= 400 && error.status < 600 ? error.status : 502 }
    );
  }

  console.error("[Bridge Wallet] Unexpected error:", error);
  return NextResponse.json(
    { error: "BRIDGE_WALLET_FAILED", message: "Unexpected Bridge error." },
    { status: 500 }
  );
}

export async function GET(request: Request) {
  if (!isBridgeConfigured()) {
    return bridgeNotConfigured();
  }

  const customerId = new URL(request.url).searchParams.get("customerId");

  if (!customerId) {
    return NextResponse.json(
      { error: "MISSING_CUSTOMER_ID", message: "customerId query parameter is required." },
      { status: 400 }
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

  try {
    const wallet = await createWallet({ customerId, chain, tags });
    return NextResponse.json({ wallet });
  } catch (error) {
    return handleBridgeError(error);
  }
}
