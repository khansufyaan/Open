import { NextResponse } from "next/server";
import { TurnkeyRequestError } from "@turnkey/sdk-server";

import {
  getTurnkeyApiClient,
  isTurnkeyConfigured,
} from "@/lib/turnkey/server";

const ALLOWED_METHODS = new Set([
  "initOtp",
  "verifyOtp",
  "otpLogin",
]);

type ServerSignRequest = {
  method?: string;
  methodName?: string;
  params?: unknown;
};

export async function POST(request: Request) {
  if (!isTurnkeyConfigured()) {
    return NextResponse.json(
      {
        error: "TURNKEY_SERVER_NOT_CONFIGURED",
        message: "Turnkey API keys are missing on the server.",
      },
      { status: 500 }
    );
  }

  let payload: ServerSignRequest;

  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json(
      {
        error: "INVALID_JSON",
        message: "Request body must be valid JSON.",
      },
      { status: 400 }
    );
  }

  const methodName =
    typeof payload.method === "string"
      ? payload.method
      : typeof payload.methodName === "string"
        ? payload.methodName
        : undefined;

  if (!methodName) {
    return NextResponse.json(
      {
        error: "INVALID_PAYLOAD",
        message: "Payload must include a method string.",
      },
      { status: 400 }
    );
  }

  if (!ALLOWED_METHODS.has(methodName)) {
    return NextResponse.json(
      {
        error: "UNSUPPORTED_METHOD",
        message: `Method ${methodName} is not allowed for server signing.`,
      },
      { status: 403 }
    );
  }

  const params = Array.isArray(payload.params) ? payload.params : [];
  const turnkeyClient = getTurnkeyApiClient();

  if (!turnkeyClient) {
    return NextResponse.json(
      {
        error: "TURNKEY_CLIENT_ERROR",
        message: "Unable to initialize Turnkey client.",
      },
      { status: 500 }
    );
  }

  const method = (turnkeyClient as Record<string, unknown>)[methodName];

  if (typeof method !== "function") {
    return NextResponse.json(
      {
        error: "UNKNOWN_METHOD",
        message: `Turnkey method ${methodName} is not available on the server client.`,
      },
      { status: 400 }
    );
  }

  try {
    const result = await (method as (...args: unknown[]) => Promise<unknown>)(
      ...params
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TurnkeyRequestError) {
      return NextResponse.json(
        {
          error: error.code ?? "TURNKEY_REQUEST_FAILED",
          message: error.message,
          details: error.details ?? null,
        },
        { status: 502 }
      );
    }

    console.error("Turnkey server sign failed", error);
    return NextResponse.json(
      {
        error: "TURNKEY_SERVER_SIGN_FAILED",
        message: "Turnkey could not stamp the request. Check server logs for details.",
      },
      { status: 500 }
    );
  }
}
