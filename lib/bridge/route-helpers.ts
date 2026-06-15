import { NextResponse } from "next/server";

import { BridgeRequestError } from "@/lib/bridge/server";

/**
 * Demo KYC auto-approval. Only ever active when Bridge is genuinely not
 * configured, so it cannot approve real users even on platforms that set
 * NODE_ENV=production for preview/staging deployments.
 */
export function isDemoAutoApprove(): boolean {
  return process.env.BRIDGE_DEMO_AUTOAPPROVE === "true" && !process.env.BRIDGE_API_KEY;
}

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
    // error.details is the raw Bridge body and may contain internal ids/PII —
    // only surface it outside production.
    const exposeDetails = process.env.NODE_ENV !== "production";
    return NextResponse.json(
      {
        error: error.code,
        message: error.message,
        ...(exposeDetails ? { details: error.details ?? null } : {}),
      },
      { status: error.status >= 400 && error.status < 600 ? error.status : 502 }
    );
  }

  console.error(`[${context}] Unexpected error:`, error);
  return NextResponse.json(
    { error: "BRIDGE_REQUEST_FAILED", message: "Unexpected Bridge error." },
    { status: 500 }
  );
}
