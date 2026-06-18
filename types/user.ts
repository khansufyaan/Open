/**
 * The single user record for Blue Wallet. One record per signed-in Privy user,
 * keyed by the Privy DID. Persisted in KV (Upstash/Vercel KV).
 *
 * The flow is: sign in (Privy) → KYC (Bridge/Persona) → provision a Bridge
 * custodial wallet + a Bridge virtual account (US bank account + routing number)
 * → send / receive inside the portal.
 */

export type VirtualAccountDetails = {
  /** US bank account number funders send ACH/wire to. */
  accountNumber: string;
  /** ABA routing number for the account. */
  routingNumber: string;
  /** Optional separate wire routing number. */
  wireRoutingNumber?: string | null;
  bankName?: string | null;
  beneficiaryName?: string | null;
  bankAddress?: string | null;
  paymentRails?: string[];
};

export type TransactionRecord = {
  id: string;
  /** "send" = crypto out; "receive" = inbound; "withdraw" = fiat cash-out (burn). */
  direction: "send" | "receive" | "withdraw";
  amount: string;
  currency: string;
  /** External address or counterparty. */
  counterparty?: string | null;
  status: string;
  txHash?: string | null;
  createdAt: string;
};

/** A linked external (fiat) bank account used for cash-out / burn. */
export type ExternalAccountDetails = {
  id: string;
  bankName?: string;
  last4?: string;
  accountHolder?: string;
  source?: "bridge" | "demo";
};

/**
 * Auto-convert deposits: the user picks one target stablecoin. Any other
 * stablecoin that lands in their wallet is automatically converted to it
 * (server-side, no approval) — so they only ever see their chosen coin.
 */
export type AutoSwapConfig = {
  /** The user's chosen target stablecoin (e.g. "usdc"). */
  targetCurrency: string;
  chain: string;
  source?: "bridge" | "demo";
  /** ISO timestamp of the last successful auto-conversion sweep, if any. */
  lastSweepAt?: string;
  updatedAt: string;
};

export type CardDetails = {
  id: string;
  brand?: string; // visa
  last4?: string;
  expMonth?: number;
  expYear?: number;
  status?: string; // active | pending | inactive
  type?: string; // virtual | physical
  source?: "bridge" | "demo";
};

export type UserRecord = {
  /** Privy DID — the partition key. Never derived from request input. */
  userId: string;
  email?: string;
  fullName?: string;
  createdAt: string;
  updatedAt: string;
  signInCompleted?: boolean;

  // --- KYC (Bridge-hosted Persona) ---
  bridgeKycLinkId?: string;
  kycLinkUrl?: string;
  /** Persona inquiry id when KYC runs via the embedded Persona SDK. */
  personaInquiryId?: string;
  kycStatus?: string; // not_started | under_review | incomplete | approved | rejected
  kycVerificationSource?: string;
  personaVerificationCompleted?: boolean;
  personaVerifiedAt?: string;

  // --- Bridge provisioning ---
  bridgeCustomerId?: string;
  bridgeWalletId?: string;
  walletAddress?: string;
  walletChain?: string;
  virtualAccountId?: string;
  virtualAccount?: VirtualAccountDetails;
  provisionSource?: "bridge" | "demo";
  onboardingCompleted?: boolean;
  /** User chose to skip KYC; demo wallet/account provisioned for testing. */
  skippedOnboarding?: boolean;

  // --- Card ---
  card?: CardDetails;

  // --- Auto-convert deposits (Bridge liquidation addresses) ---
  autoSwap?: AutoSwapConfig;

  // --- Cash out / burn (linked fiat bank account) ---
  externalAccount?: ExternalAccountDetails;

  // --- Activity ---
  transactions?: TransactionRecord[];
};
