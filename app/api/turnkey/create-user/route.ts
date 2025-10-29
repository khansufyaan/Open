import { NextResponse } from "next/server";
import { TurnkeyRequestError } from "@turnkey/sdk-server";

import {
  getTurnkeyApiClient,
  getTurnkeyOrganizationId,
  isTurnkeyConfigured,
} from "@/lib/turnkey/server";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function POST(request: Request) {
  if (!isTurnkeyConfigured()) {
    console.error("[Turnkey Create User] Turnkey not configured - missing API keys");
    return NextResponse.json(
      {
        error: "TURNKEY_SERVER_NOT_CONFIGURED",
        message: "Turnkey API keys are missing on the server.",
      },
      { status: 500 }
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "INVALID_JSON",
        message: "Request body must be valid JSON.",
      },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      {
        error: "INVALID_PAYLOAD",
        message: "Payload must provide an email field.",
      },
      { status: 400 }
    );
  }

  const email = normalizeEmail((body as { email?: string }).email ?? "");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      {
        error: "INVALID_EMAIL",
        message: "Provide a valid email address to create a Turnkey user.",
      },
      { status: 400 }
    );
  }

  const turnkeyClient = getTurnkeyApiClient();
  const organizationId = getTurnkeyOrganizationId();

  console.log(`[Turnkey Create User] Attempting to create/verify user for email: ${email}`);
  console.log(`[Turnkey Create User] Organization ID: ${organizationId}`);

  if (!turnkeyClient || !organizationId) {
    console.error("[Turnkey Create User] Failed to initialize Turnkey client or get organization ID");
    return NextResponse.json(
      {
        error: "TURNKEY_CLIENT_ERROR",
        message: "Unable to initialize Turnkey client.",
      },
      { status: 500 }
    );
  }

  // IMPORTANT: Check if user already exists BEFORE creating
  // Turnkey does NOT enforce uniqueness on sub-org names, so we must check manually
  try {
    console.log(`[Turnkey Create User] Searching for existing user with email: ${email}`);
    const subOrgsResponse = await turnkeyClient.getSubOrgIds({ organizationId });
    const subOrgIds = subOrgsResponse.organizationIds ?? [];
    console.log(`[Turnkey Create User] Checking ${subOrgIds.length} existing sub-orgs`);

    // Search all sub-orgs for a user with this email
    for (const subOrgId of subOrgIds) {
      try {
        console.log(`[Turnkey Create User] Checking sub-org ${subOrgId} for user ${email}`);
        const usersResponse = await turnkeyClient.getUsers({ organizationId: subOrgId });
        const users = usersResponse.users ?? [];
        console.log(`[Turnkey Create User] Sub-org ${subOrgId} has ${users.length} users`);

        for (const user of users) {
          console.log(`[Turnkey Create User] Checking user: ${user.email} vs ${email}`);
          if (user.email?.toLowerCase() === email.toLowerCase()) {
            console.log(`[Turnkey Create User] ✅ MATCH! Found existing user in sub-org: ${subOrgId}`);
            console.log(`[Turnkey Create User] User email: ${user.email}, userName: ${user.userName}`);
            return NextResponse.json({
              created: false,
              subOrgExists: true,
              subOrganizationId: subOrgId,
            });
          }
        }
        console.log(`[Turnkey Create User] No match found in sub-org ${subOrgId}`);
      } catch (err) {
        console.error(`[Turnkey Create User] ERROR checking users in sub-org ${subOrgId}:`, err);
      }
    }

    console.log(`[Turnkey Create User] No existing user found, creating new sub-organization`);
  } catch (searchError) {
    console.error(`[Turnkey Create User] Error searching for existing user:`, searchError);
    // Continue with creation if search fails
  }

  // No existing user found, create new sub-org
  try {
    const subOrgName = `User: ${email}`;
    console.log(`[Turnkey Create User] Creating sub-organization: "${subOrgName}"`);
    console.log(`[Turnkey Create User] Parent org: ${organizationId}`);

    const response = await turnkeyClient.createSubOrganization({
      organizationId,
      subOrganizationName: subOrgName,
      rootUsers: [
        {
          userName: email,
          userEmail: email,
          apiKeys: [],
          authenticators: [],
          oauthProviders: [],
        },
      ],
      rootQuorumThreshold: 1,
    });

    const subOrgId = response.subOrganizationId;
    console.log(`[Turnkey Create User] ✅ NEW sub-organization created successfully`);
    console.log(`[Turnkey Create User] Sub-Org ID: ${subOrgId}`);
    console.log(`[Turnkey Create User] Sub-Org Name: "${subOrgName}"`);

    return NextResponse.json({
      created: true,
      subOrganizationId: subOrgId,
    });
  } catch (rawError) {
    const error = rawError as unknown;
    const code =
      typeof (error as { code?: unknown })?.code === "number"
        ? String((error as { code?: unknown }).code)
        : (error as { code?: unknown }).code;
    const message =
      typeof (error as { message?: unknown })?.message === "string"
        ? ((error as { message: string }).message ?? "")
        : "";
    const normalizedMessage = message.toLowerCase();
    // This shouldn't happen since we check for duplicates upfront,
    // but handle it just in case
    const duplicateEmail =
      code === "CONFLICT" ||
      normalizedMessage.includes("must be unique") ||
      normalizedMessage.includes("already exists") ||
      normalizedMessage.includes("duplicate");

    if (duplicateEmail) {
      console.error(`[Turnkey Create User] Unexpected duplicate error after pre-check for ${email}`);
      console.error(`[Turnkey Create User] This indicates the pre-check failed or a race condition occurred`);

      return NextResponse.json({
        error: "DUPLICATE_USER_CREATION_FAILED",
        message: "This email is already registered. Please try signing in again.",
        created: false,
      }, { status: 409 });
    }

    console.error(`[Turnkey Create User] Failed to create user ${email}:`, {
      code,
      message,
      error: error instanceof TurnkeyRequestError ? {
        message: error.message,
        details: error.details,
      } : error,
    });

    if (error instanceof TurnkeyRequestError) {
      return NextResponse.json(
        {
          error: code ?? "TURNKEY_CREATE_USER_FAILED",
          message: error.message,
          details: error.details ?? null,
        },
        { status: 502 }
      );
    }

    console.error("Turnkey create user failed", error);
    return NextResponse.json(
      {
        error: "TURNKEY_CREATE_USER_FAILED",
        message: "Unexpected error creating Turnkey user.",
      },
      { status: 500 }
    );
  }
}
