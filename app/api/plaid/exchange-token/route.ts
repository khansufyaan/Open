import { NextResponse } from "next/server";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

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

export async function POST(request: Request) {
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

  const publicToken = (body as { public_token?: string }).public_token;

  if (!publicToken) {
    return NextResponse.json(
      {
        error: "MISSING_PUBLIC_TOKEN",
        message: "public_token is required.",
      },
      { status: 400 }
    );
  }

  try {
    // Exchange public token for access token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = exchangeResponse.data.access_token;

    // Immediately fetch identity data
    const identityResponse = await plaidClient.identityGet({
      access_token: accessToken,
    });

    const accounts = identityResponse.data.accounts;

    // Extract identity data from the first account
    if (accounts.length === 0 || !accounts[0].owners || accounts[0].owners.length === 0) {
      return NextResponse.json(
        {
          error: "NO_IDENTITY_DATA",
          message: "No identity information found for this account.",
        },
        { status: 404 }
      );
    }

    const owner = accounts[0].owners[0];

    const identityData = {
      names: owner.names || [],
      emails: owner.emails?.map(e => e.data) || [],
      phones: owner.phone_numbers?.map(p => p.data) || [],
      addresses: owner.addresses?.map(a => ({
        street: a.data.street,
        city: a.data.city,
        region: a.data.region,
        postal_code: a.data.postal_code,
        country: a.data.country,
      })) || [],
    };

    return NextResponse.json({
      success: true,
      identity: identityData,
    });
  } catch (error) {
    console.error("Plaid token exchange or identity fetch failed:", error);
    return NextResponse.json(
      {
        error: "PLAID_OPERATION_FAILED",
        message: "Failed to exchange token or fetch identity data.",
      },
      { status: 500 }
    );
  }
}
