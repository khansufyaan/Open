import { NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/server-auth";

/**
 * Server-side Privy authentication.
 *
 * The client authenticates with Privy (email OTP / wallet / social) and sends
 * the resulting access token as a Bearer header. We verify that token here and
 * derive the user id from the verified Privy DID — never from request input.
 */

let cachedClient: PrivyClient | null = null;

let warnedUnconfigured = false;

function getPrivyClient(): PrivyClient | null {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!appId || !appSecret) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn(
        "[Auth] Privy is not configured (NEXT_PUBLIC_PRIVY_APP_ID / PRIVY_APP_SECRET missing) — all authenticated routes will return 503."
      );
    }
    return null;
  }

  if (!cachedClient) {
    cachedClient = new PrivyClient(appId, appSecret);
  }

  return cachedClient;
}

export function isPrivyConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID && process.env.PRIVY_APP_SECRET);
}

export type AuthContext = {
  /** Stable, non-forgeable user id (the Privy DID). */
  userId: string;
};

function extractBearer(request: Request): string | null {
  // Headers.get is case-insensitive, so a single lookup covers any casing.
  const header = request.headers.get("authorization");
  if (!header) {
    return null;
  }
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Verifies the Privy access token on the request. Returns the auth context, or
 * null when no/invalid token is present (or Privy isn't configured).
 */
export async function verifyAuth(request: Request): Promise<AuthContext | null> {
  const client = getPrivyClient();
  if (!client) {
    return null;
  }

  const token = extractBearer(request);
  if (!token) {
    return null;
  }

  try {
    const claims = await client.verifyAuthToken(
      token,
      process.env.PRIVY_VERIFICATION_KEY
    );
    return { userId: claims.userId };
  } catch (error) {
    // Log the failure (never the token) so an invalid token can be told apart
    // from a Privy outage in the server logs.
    console.error(
      "[Auth] Privy token verification failed:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/** Best-effort lookup of the user's primary email from Privy. */
export async function getPrivyEmail(userId: string): Promise<string | undefined> {
  const client = getPrivyClient();
  if (!client) {
    return undefined;
  }

  try {
    const user = await client.getUser(userId);
    const direct = (user as { email?: { address?: string } }).email?.address;
    if (direct) {
      return direct.toLowerCase();
    }
    const linked = (user as { linkedAccounts?: Array<{ type?: string; address?: string }> })
      .linkedAccounts?.find((account) => account.type === "email");
    return linked?.address ? linked.address.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}

export function unauthorized(message = "Authentication required.") {
  return NextResponse.json({ error: "UNAUTHENTICATED", message }, { status: 401 });
}

/**
 * Single entry point for protected routes. Returns the AuthContext on success,
 * or a NextResponse that the caller should return directly: 503 when Privy is
 * not configured (so misconfiguration is distinguishable from a bad token) and
 * 401 for a missing/invalid token.
 *
 * Usage:
 *   const auth = await requireAuth(request);
 *   if (auth instanceof NextResponse) return auth;
 *   // auth.userId is now safe to use
 */
export async function requireAuth(request: Request): Promise<AuthContext | NextResponse> {
  if (!isPrivyConfigured()) {
    return authNotConfigured();
  }
  const auth = await verifyAuth(request);
  if (!auth) {
    return unauthorized();
  }
  return auth;
}

export function authNotConfigured() {
  return NextResponse.json(
    {
      error: "AUTH_NOT_CONFIGURED",
      message: "Privy auth is not configured. Set NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET.",
    },
    { status: 503 }
  );
}
