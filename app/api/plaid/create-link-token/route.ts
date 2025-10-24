import { NextResponse } from "next/server";
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from "plaid";

function getPlaidClient() {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = process.env.PLAID_ENV || "sandbox";

  if (!clientId || !secret) {
    return null;
  }

  const configuration = new Configuration({
    basePath: env === "production"
      ? PlaidEnvironments.production
      : env === "development"
      ? PlaidEnvironments.development
      : PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });

  return new PlaidApi(configuration);
}

export async function POST() {
  const plaidClient = getPlaidClient();

  if (!plaidClient) {
    return NextResponse.json(
      {
        error: "PLAID_NOT_CONFIGURED",
        message: "Plaid credentials are missing on the server.",
      },
      { status: 500 }
    );
  }

  try {
    console.log("Creating Plaid link token with environment:", process.env.PLAID_ENV);

    const response = await plaidClient.linkTokenCreate({
      user: {
        client_user_id: "user-" + Date.now(), // In production, use actual user ID from session
      },
      client_name: "Blue Wallet",
      products: [Products.Identity, Products.Auth],
      country_codes: [CountryCode.Us],
      language: "en",
    });

    console.log("Plaid link token created successfully");
    return NextResponse.json({ link_token: response.data.link_token });
  } catch (error) {
    console.error("Plaid link token creation failed:", error);
    console.error("Error details:", JSON.stringify(error, null, 2));

    const errorMessage = error instanceof Error ? error.message : "Failed to create Plaid link token.";

    return NextResponse.json(
      {
        error: "LINK_TOKEN_CREATE_FAILED",
        message: errorMessage,
        details: error,
      },
      { status: 500 }
    );
  }
}
