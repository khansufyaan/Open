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
  /** "send" = pay out from this wallet; "receive" = inbound deposit. */
  direction: "send" | "receive";
  amount: string;
  currency: string;
  /** External address or counterparty. */
  counterparty?: string | null;
  status: string;
  txHash?: string | null;
  createdAt: string;
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

  // --- Activity ---
  transactions?: TransactionRecord[];
};
