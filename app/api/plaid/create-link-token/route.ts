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
    const response = await plaidClient.linkTokenCreate({
      user: {
        client_user_id: "user-" + Date.now(), // In production, use actual user ID from session
      },
      client_name: "Blue Wallet",
      products: [Products.Identity],
      country_codes: [CountryCode.Us],
      language: "en",
    });

    return NextResponse.json({ link_token: response.data.link_token });
  } catch (error) {
    console.error("Plaid link token creation failed:", error);
    return NextResponse.json(
      {
        error: "LINK_TOKEN_CREATE_FAILED",
        message: "Failed to create Plaid link token.",
      },
      { status: 500 }
    );
  }
}
