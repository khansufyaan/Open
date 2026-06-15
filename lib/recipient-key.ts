import { createHash } from "crypto";

export function sanitizeDigits(value: string): string {
  return value.replace(/\D+/g, "");
}

/**
 * Deterministic key identifying a recipient by their bank coordinates. Used to
 * route transfers and to authorize claim/withdraw against a user's linked
 * Plaid accounts.
 */
export function buildRecipientKey(routingNumber: string, accountNumber: string): string {
  const normalizedRouting = sanitizeDigits(routingNumber);
  const normalizedAccount = sanitizeDigits(accountNumber);

  return createHash("sha256")
    .update(`${normalizedRouting}|${normalizedAccount}`, "utf8")
    .digest("hex");
}

type PlaidAccountLike = {
  routingNumber?: string | null;
  accountNumber?: string | null;
};

/** Builds the set of recipient keys a user controls from their linked accounts. */
export function recipientKeysForAccounts(accounts: PlaidAccountLike[] | undefined): Set<string> {
  const keys = new Set<string>();
  if (!Array.isArray(accounts)) {
    return keys;
  }
  for (const account of accounts) {
    if (account?.routingNumber && account?.accountNumber) {
      keys.add(buildRecipientKey(account.routingNumber, account.accountNumber));
    }
  }
  return keys;
}
