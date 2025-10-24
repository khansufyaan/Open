import { NextResponse } from "next/server";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

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

const USERS_TABLE = "blue-wallet-users";

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-2",
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);

function sanitizeDigits(value: string | null | undefined): string {
  return typeof value === "string" ? value.replace(/\D+/g, "") : "";
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

  const { public_token: publicToken, userId } = body as { public_token?: string; userId?: string };

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

    let achAccounts: Array<{
      accountId: string;
      accountNumber: string;
      routingNumber: string;
      wireRoutingNumber: string | null;
      mask: string | null;
      name: string | null;
    }> = [];

    try {
      const authResponse = await plaidClient.authGet({
        access_token: accessToken,
      });

      const achNumbers = authResponse.data.numbers?.ach ?? [];
      const authAccounts = authResponse.data.accounts ?? [];
      const authAccountsById = new Map(
        authAccounts.map((account) => [account.account_id, account])
      );

      achAccounts = achNumbers
        .map((achEntry) => {
          const authAccount = authAccountsById.get(achEntry.account_id);

          return {
            accountId: achEntry.account_id,
            accountNumber: achEntry.account,
            routingNumber: achEntry.routing,
            wireRoutingNumber: achEntry.wire_routing ?? null,
            mask: authAccount?.mask ?? (achEntry.account ? achEntry.account.slice(-4) : null),
            name: authAccount?.name ?? authAccount?.official_name ?? null,
          };
        })
        .filter((value): value is NonNullable<typeof value> => Boolean(value.accountNumber && value.routingNumber));
    } catch (authError) {
      console.warn("Plaid authGet failed to return ACH data", authError);
      return NextResponse.json(
        {
          error: "AUTH_GET_FAILED",
          message: "Failed to retrieve bank account details.",
        },
        { status: 500 }
      );
    }

    // Minimal identity data (no longer fetching from Identity product)
    const identityData = {
      names: [],
      emails: [],
      phones: [],
      addresses: [],
    };

    const sanitizedAccounts = achAccounts
      .map((account) => ({
        accountId: account.accountId,
        accountNumber: sanitizeDigits(account.accountNumber),
        routingNumber: sanitizeDigits(account.routingNumber),
        wireRoutingNumber: account.wireRoutingNumber ?? null,
        mask: account.mask ?? null,
        name: account.name ?? null,
      }))
      .filter((account) => account.accountNumber && account.routingNumber);

    if (userId) {
      try {
        const timestamp = new Date().toISOString();
        const existing = await docClient.send(
          new GetCommand({
            TableName: USERS_TABLE,
            Key: { userId },
          })
        );

        const previous = existing.Item ?? {};

        const previousAccounts = Array.isArray(previous.plaidAchAccounts)
          ? (previous.plaidAchAccounts as typeof sanitizedAccounts)
          : [];

        const accountMap = new Map<string, (typeof sanitizedAccounts)[number]>();

        const accountKey = (account: (typeof sanitizedAccounts)[number]) =>
          account.accountId ? account.accountId : `${account.routingNumber}:${account.accountNumber}`;

        for (const account of previousAccounts) {
          accountMap.set(accountKey(account), account);
        }

        for (const account of sanitizedAccounts) {
          accountMap.set(accountKey(account), account);
        }

        const mergedAccounts = Array.from(accountMap.values());

        await docClient.send(
          new PutCommand({
            TableName: USERS_TABLE,
            Item: {
              ...previous,
              userId,
              plaidAccessToken: accessToken,
              plaidItemId: exchangeResponse.data.item_id ?? previous.plaidItemId,
              plaidAchAccounts: mergedAccounts,
              plaidIdentitySnapshot: identityData,
              plaidVerificationCompleted: true,
              plaidLastLinkedAt: timestamp,
              createdAt: previous.createdAt ?? timestamp,
              updatedAt: timestamp,
            },
          })
        );
      } catch (persistError) {
        console.error("Failed to persist Plaid credentials:", persistError);
      }
    }

    return NextResponse.json({
      success: true,
      identity: identityData,
      achAccounts,
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
