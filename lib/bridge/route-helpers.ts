import { NextResponse } from "next/server";

import { BridgeRequestError } from "@/lib/bridge/server";

export function bridgeNotConfigured() {
  return NextResponse.json(
    {
      error: "BRIDGE_NOT_CONFIGURED",
      message: "Bridge API key is missing on the server. Set BRIDGE_API_KEY.",
    },
    { status: 500 }
  );
}

export function handleBridgeError(error: unknown, context = "Bridge") {
  if (error instanceof BridgeRequestError) {
    return NextResponse.json(
      { error: error.code, message: error.message, details: error.details ?? null },
      { status: error.status >= 400 && error.status < 600 ? error.status : 502 }
    );
  }

  console.error(`[${context}] Unexpected error:`, error);
  return NextResponse.json(
    { error: "BRIDGE_REQUEST_FAILED", message: "Unexpected Bridge error." },
    { status: 500 }
  );
}
