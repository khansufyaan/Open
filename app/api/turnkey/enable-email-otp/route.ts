import { NextResponse } from "next/server";
import { getTurnkeyApiClient, getTurnkeyOrganizationId, isTurnkeyConfigured } from "@/lib/turnkey/server";

/**
 * Enable Email OTP Authentication feature for the Turnkey organization.
 *
 * This must be run ONCE to enable email OTP auth for the entire organization.
 * After enabling, users can be created and authenticated via email OTP.
 *
 * Reference: https://docs.turnkey.com/authentication/email
 */
export async function POST() {
  if (!isTurnkeyConfigured()) {
    return NextResponse.json(
      {
        error: "TURNKEY_NOT_CONFIGURED",
        message: "Turnkey API credentials are not configured.",
      },
      { status: 500 }
    );
  }

  const turnkeyClient = getTurnkeyApiClient();
  const organizationId = getTurnkeyOrganizationId();

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
    console.log(`[Enable Email OTP] Enabling FEATURE_NAME_OTP_EMAIL_AUTH for org: ${organizationId}`);

    await turnkeyClient.setOrganizationFeature({
      organizationId,
      name: "FEATURE_NAME_OTP_EMAIL_AUTH",
    });

    console.log(`[Enable Email OTP] Successfully enabled email OTP feature`);

    return NextResponse.json({
      success: true,
      message: "Email OTP authentication has been enabled for your organization.",
      organizationId,
    });
  } catch (error) {
    console.error("[Enable Email OTP] Failed to enable feature:", error);

    return NextResponse.json(
      {
        error: "ENABLE_FEATURE_FAILED",
        message: error instanceof Error ? error.message : "Failed to enable email OTP feature.",
        details: error,
      },
      { status: 500 }
    );
  }
}
