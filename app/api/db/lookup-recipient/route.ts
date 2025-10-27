import { NextResponse } from "next/server";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = "blue-wallet-users";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-2",
});

const docClient = DynamoDBDocumentClient.from(client);

const DIGIT_REGEX = /\D+/g;

function sanitizeDigits(value: string | null | undefined): string {
  return typeof value === "string" ? value.replace(DIGIT_REGEX, "") : "";
}

function maskValue(raw: string): string | null {
  if (!raw) {
    return null;
  }

  if (raw.length <= 4) {
    return raw;
  }

  const last4 = raw.slice(-4);
  return `${"*".repeat(raw.length - 4)}${last4}`;
}

type PlaidAccount = {
  accountId?: string;
  accountNumber?: string;
  routingNumber?: string;
  wireRoutingNumber?: string | null;
  mask?: string | null;
  name?: string | null;
};

type IdentitySnapshot = {
  names?: string[];
  emails?: string[];
  phones?: string[];
  addresses?: Array<{
    street: string;
    city: string;
    region: string;
    postal_code: string;
    country: string;
  }>;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accountParam = searchParams.get("accountNumber");
  const routingParam = searchParams.get("routingNumber");

  const normalizedAccount = sanitizeDigits(accountParam);
  const normalizedRouting = sanitizeDigits(routingParam);

  if (!normalizedAccount || normalizedAccount.length < 3 || !normalizedRouting || normalizedRouting.length < 4) {
    return NextResponse.json(
      {
        error: "INVALID_PARAMETERS",
        message: "Provide at least the account number and routing number to search.",
      },
      { status: 400 }
    );
  }

  const last4 = normalizedAccount.slice(-4);
  const routingLast4 = normalizedRouting.slice(-4);

  const matches: Array<{
    userId: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    confidence: "exact" | "mask" | "mask-routing";
    accountMask: string | null;
    routingMask: string | null;
  }> = [];
  const seenAccountKeys = new Set<string>();

  let exclusiveStartKey: Record<string, unknown> | undefined;

  try {
    do {
      const response = await docClient.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          ExclusiveStartKey: exclusiveStartKey,
        })
      );

      const items = response.Items ?? [];

      for (const item of items) {
        const userId = typeof item.userId === "string" ? item.userId : null;
        if (!userId) {
          continue;
        }

        const accountsRaw = Array.isArray(item.plaidAchAccounts)
          ? (item.plaidAchAccounts as PlaidAccount[])
          : [];

        let bestConfidence: "exact" | "mask" | "mask-routing" | null = null;

        for (const account of accountsRaw) {
          const storedAccount = sanitizeDigits(account.accountNumber);
          const storedRouting = sanitizeDigits(account.routingNumber);
          const storedMask = sanitizeDigits(account.mask) || storedAccount.slice(-4);
          const storedRoutingMask = storedRouting ? storedRouting.slice(-4) : "";

          const exactMatch = Boolean(
            storedAccount &&
              storedRouting &&
              storedAccount === normalizedAccount &&
              storedRouting === normalizedRouting
          );

          const maskMatch = Boolean(storedMask && last4 && storedMask === last4);
          const routingMaskMatch = Boolean(storedRoutingMask && routingLast4 && storedRoutingMask === routingLast4);

          if (!exactMatch && !maskMatch) {
            continue;
          }

          const confidence: "exact" | "mask" | "mask-routing" = exactMatch
            ? "exact"
            : maskMatch && routingMaskMatch
            ? "mask-routing"
            : "mask";

          if (bestConfidence === "exact" || (bestConfidence === "mask-routing" && confidence === "mask")) {
            continue;
          }

          const identity = (item.plaidIdentitySnapshot ?? {}) as IdentitySnapshot;
          const identityNames = Array.isArray(identity.names) ? identity.names : [];
          const identityEmails = Array.isArray(identity.emails) ? identity.emails : [];
          const identityPhones = Array.isArray(identity.phones) ? identity.phones : [];
          const identityAddresses = Array.isArray(identity.addresses) ? identity.addresses : [];

          const fallbackName = typeof item.plaidVerifiedName === "string" ? item.plaidVerifiedName : null;
          const fallbackEmail = typeof item.plaidVerifiedEmail === "string" ? item.plaidVerifiedEmail : null;
          const fallbackPhone = typeof item.plaidVerifiedPhone === "string" ? item.plaidVerifiedPhone : null;
          const fallbackAddress = item.plaidVerifiedAddress && typeof item.plaidVerifiedAddress === "object"
            ? item.plaidVerifiedAddress
            : null;

          const accountDisplay = storedAccount;
          const routingDisplay = storedRouting || sanitizeDigits(item.plaidVerifiedRoutingNumber);

          const matchEntry = {
            userId,
            name: identityNames[0] ?? fallbackName ?? null,
            email: identityEmails[0] ?? fallbackEmail ?? null,
            phone: identityPhones[0] ?? fallbackPhone ?? null,
            address: identityAddresses[0] ?? fallbackAddress ?? null,
            confidence,
            accountMask: accountDisplay ?? null,
            routingMask: routingDisplay ?? null,
          };
          const matchKey = storedRouting && storedAccount
            ? `${storedRouting}:${storedAccount}`
            : storedRoutingMask && storedMask
            ? `${storedRoutingMask}:${storedMask}`
            : null;

          if (matchKey && seenAccountKeys.has(matchKey)) {
            continue;
          }

          bestConfidence = confidence;

          const existingIndex = matches.findIndex((existing) => existing.userId === userId);

          if (existingIndex >= 0) {
            matches[existingIndex] = matchEntry;
          } else {
            matches.push(matchEntry);
          }

          if (matchKey) {
            seenAccountKeys.add(matchKey);
          }

          if (confidence === "exact") {
            break;
          }
        }
      }

      exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (exclusiveStartKey);
  } catch (error) {
    console.error("Recipient lookup failed", error);

    return NextResponse.json(
      {
        error: "LOOKUP_FAILED",
        message: "Unable to search for recipient details.",
      },
      { status: 500 }
    );
  }

  if (matches.length === 0) {
    return NextResponse.json(
      {
        success: false,
        matches: [],
        message: "No recipient records found for the supplied bank details.",
      },
      { status: 404 }
    );
  }

  matches.sort((a, b) => {
    if (a.confidence === b.confidence) {
      return a.userId.localeCompare(b.userId);
    }

    const order: Record<typeof a.confidence, number> = {
      exact: 0,
      "mask-routing": 1,
      mask: 2,
    };

    return order[a.confidence] - order[b.confidence];
  });

  return NextResponse.json({
    success: true,
    matches,
  });
}
