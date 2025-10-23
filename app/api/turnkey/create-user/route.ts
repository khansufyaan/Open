import { NextResponse } from "next/server";
import { TurnkeyRequestError } from "@turnkey/sdk-server";

import {
  getTurnkeyApiClient,
  getTurnkeyOrganizationId,
  isTurnkeyConfigured,
} from "@/lib/turnkey/server";

function parseEmailOtpTagIds(): string[] {
  const raw = process.env.TURNKEY_EMAIL_OTP_TAG_IDS ?? "";

  return Array.from(
    new Set(
      raw
        .split(/[,\s]+/)
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  );
}

async function ensureUserHasTags(params: {
  turnkeyClient: ReturnType<typeof getTurnkeyApiClient>;
  organizationId: string;
  userId: string;
  requiredTagIds: string[];
}) {
  const { turnkeyClient, organizationId, userId, requiredTagIds } = params;

  if (!turnkeyClient || requiredTagIds.length === 0) {
    return;
  }

  try {
    const usersResponse = await turnkeyClient.getUsers({ organizationId });
    const users = usersResponse.users ?? [];
    const targetUser = users.find((user) => user.userId === userId);

    if (!targetUser) {
      return;
    }

    const currentTagIds = targetUser.userTags ?? [];
    const missing = requiredTagIds.filter((tagId) => !currentTagIds.includes(tagId));

    if (missing.length === 0) {
      return;
    }

    const updatedTagIds = Array.from(new Set([...currentTagIds, ...requiredTagIds]));

    await turnkeyClient.updateUser({
      organizationId,
      userId,
      userTagIds: updatedTagIds,
    });
  } catch (error) {
    console.error("Failed to ensure user tags", error);
  }
}

async function ensureUserEmailHasTags(params: {
  turnkeyClient: ReturnType<typeof getTurnkeyApiClient>;
  organizationId: string;
  email: string;
  requiredTagIds: string[];
}) {
  const { turnkeyClient, organizationId, email, requiredTagIds } = params;

  if (!turnkeyClient || requiredTagIds.length === 0) {
    return;
  }

  try {
    const usersResponse = await turnkeyClient.getUsers({ organizationId });
    const users = usersResponse.users ?? [];
    const normalizedEmail = email.toLowerCase();
    const targetUser = users.find(
      (user) => user.userEmail?.toLowerCase() === normalizedEmail
    );

    if (!targetUser) {
      return;
    }

    await ensureUserHasTags({
      turnkeyClient,
      organizationId,
      userId: targetUser.userId,
      requiredTagIds,
    });
  } catch (error) {
    console.error("Failed to ensure tags for user email", error);
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

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
  const emailOtpTagIds = parseEmailOtpTagIds();

  if (!turnkeyClient || !organizationId) {
    return NextResponse.json(
      {
        error: "TURNKEY_CLIENT_ERROR",
        message: "Unable to initialize Turnkey client.",
      },
      { status: 500 }
    );
  }

  try {
    const response = await turnkeyClient.createUsers({
      organizationId,
      users: [
        {
          userName: email,
          userEmail: email,
          apiKeys: [],
          authenticators: [],
          oauthProviders: [],
          userTags: emailOtpTagIds,
        },
      ],
    });

    const createdUserId = response.userIds?.[0] ?? null;

    if (createdUserId) {
      await ensureUserHasTags({
        turnkeyClient,
        organizationId,
        userId: createdUserId,
        requiredTagIds: emailOtpTagIds,
      });
    }

    return NextResponse.json({
      created: true,
      userId: response.userIds?.[0] ?? null,
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
    const duplicateEmail =
      code === "CONFLICT" || normalizedMessage.includes("must be unique");

    if (duplicateEmail) {
      if (emailOtpTagIds.length > 0) {
        await ensureUserEmailHasTags({
          turnkeyClient,
          organizationId,
          email,
          requiredTagIds: emailOtpTagIds,
        });
      }

      return NextResponse.json({ created: false });
    }

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
