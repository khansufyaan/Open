import { randomUUID } from "crypto";

/**
 * Minimal server-side client for the Bridge API (https://apidocs.bridge.xyz).
 *
 * Bridge custodies the private keys for the wallets it provisions and signs +
 * broadcasts transfers on our behalf, so this app no longer performs any
 * client-side key management or raw transaction signing.
 */

const DEFAULT_BASE_URL = "https://api.bridge.xyz";
const DEFAULT_API_VERSION = "v0";

function getBaseUrl(): string {
  // Server-only: do not expose the Bridge base URL via a NEXT_PUBLIC_ var.
  return (process.env.BRIDGE_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
}

function getApiVersion(): string {
  return process.env.BRIDGE_API_VERSION ?? DEFAULT_API_VERSION;
}

function getApiKey(): string | null {
  return process.env.BRIDGE_API_KEY ?? null;
}

export function isBridgeConfigured(): boolean {
  return Boolean(getApiKey());
}

export type BridgeError = {
  status: number;
  code: string;
  message: string;
  details?: unknown;
};

export class BridgeRequestError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor({ status, code, message, details }: BridgeError) {
    super(message);
    this.name = "BridgeRequestError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  idempotencyKey?: string;
  query?: Record<string, string | number | undefined>;
};

async function bridgeRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new BridgeRequestError({
      status: 500,
      code: "BRIDGE_NOT_CONFIGURED",
      message: "Bridge API key is missing. Set BRIDGE_API_KEY on the server.",
    });
  }

  const { method = "GET", body, idempotencyKey, query } = options;

  const url = new URL(`${getBaseUrl()}/${getApiVersion()}${path}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = {
    "Api-Key": apiKey,
    Accept: "application/json",
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (method !== "GET") {
    // Bridge requires an idempotency key on all mutating requests.
    headers["Idempotency-Key"] = idempotencyKey ?? randomUUID();
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const text = await response.text();
  let payload: unknown = null;
  let parseFailed = false;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      parseFailed = true;
    }
  }

  // A successful response with a non-empty, unparseable body is a protocol
  // error — surface it instead of silently returning null to the caller.
  if (response.ok && parseFailed) {
    throw new BridgeRequestError({
      status: 502,
      code: "BRIDGE_INVALID_RESPONSE",
      message: `Bridge returned a non-JSON response for ${path}.`,
    });
  }

  if (!response.ok) {
    const errorBody = (payload ?? {}) as Record<string, unknown>;
    throw new BridgeRequestError({
      status: response.status,
      code: typeof errorBody.code === "string" ? errorBody.code : "BRIDGE_REQUEST_FAILED",
      message:
        typeof errorBody.message === "string"
          ? errorBody.message
          : `Bridge request to ${path} failed with status ${response.status}.`,
      details: errorBody,
    });
  }

  return payload as T;
}

/* -------------------------------------------------------------------------- */
/*                                  Customers                                 */
/* -------------------------------------------------------------------------- */

export type BridgeCustomer = {
  id: string;
  type?: string;
  email?: string;
  status?: string;
  kyc_status?: string;
  first_name?: string;
  last_name?: string;
  // Bridge associates KYC with an external identity provider (Persona).
  endorsements?: Array<{ name: string; status: string }>;
};

export type CreateCustomerInput = {
  email: string;
  type?: "individual" | "business";
  /**
   * Identifier of the completed Persona inquiry used to satisfy Bridge KYC.
   * Bridge can ingest a Persona inquiry directly instead of re-collecting data.
   */
  personaInquiryId?: string;
  fullName?: string;
  /** Stable key so retries don't create duplicate customers. */
  idempotencyKey?: string;
};

export async function createCustomer(input: CreateCustomerInput): Promise<BridgeCustomer> {
  const [firstName, ...rest] = (input.fullName ?? "").trim().split(/\s+/);

  const body: Record<string, unknown> = {
    type: input.type ?? "individual",
    email: input.email,
  };

  if (firstName) {
    body.first_name = firstName;
    body.last_name = rest.join(" ") || firstName;
  }

  if (input.personaInquiryId) {
    // Hand the verified Persona inquiry to Bridge so it can reuse the KYC result.
    body.identifying_information = {
      type: "persona",
      persona_inquiry_id: input.personaInquiryId,
    };
  }

  return bridgeRequest<BridgeCustomer>("/customers", {
    method: "POST",
    idempotencyKey: input.idempotencyKey,
    body,
  });
}

export async function getCustomer(customerId: string): Promise<BridgeCustomer> {
  return bridgeRequest<BridgeCustomer>(`/customers/${customerId}`);
}

/** Bridge's authoritative KYC status string for a customer. */
export function getCustomerKycStatus(customer: BridgeCustomer): string {
  return customer.kyc_status ?? customer.status ?? "under_review";
}

/** True when Bridge reports the customer's KYC as approved/active. */
export function isCustomerApproved(customer: BridgeCustomer): boolean {
  const status = (customer.kyc_status ?? customer.status ?? "").toLowerCase();
  if (["approved", "active", "complete", "completed"].includes(status)) {
    return true;
  }
  return (customer.endorsements ?? []).some(
    (endorsement) => endorsement.status?.toLowerCase() === "approved"
  );
}

/* -------------------------------------------------------------------------- */
/*                                    KYC                                     */
/* -------------------------------------------------------------------------- */

/**
 * Bridge runs KYC through a hosted Persona flow. Creating a KYC link returns a
 * short-lived `bridge.withpersona.com` URL; Bridge then reports the verified
 * status authoritatively on the KYC link (`kyc_status`) and the underlying
 * customer, so we never trust a client-supplied verification result.
 */
export type BridgeKycLink = {
  id: string;
  email: string;
  type?: string;
  full_name?: string;
  kyc_link: string;
  tos_link?: string;
  // not_started | under_review | incomplete | approved | rejected
  kyc_status: string;
  // pending | approved
  tos_status?: string;
  customer_id?: string;
  created_at?: string;
};

export type CreateKycLinkInput = {
  email: string;
  fullName: string;
  type?: "individual" | "business";
  endorsements?: string[];
  redirectUri?: string;
};

export async function createKycLink(input: CreateKycLinkInput): Promise<BridgeKycLink> {
  return bridgeRequest<BridgeKycLink>("/kyc_links", {
    method: "POST",
    body: {
      full_name: input.fullName,
      email: input.email,
      type: input.type ?? "individual",
      ...(input.endorsements ? { endorsements: input.endorsements } : {}),
      ...(input.redirectUri ? { redirect_uri: input.redirectUri } : {}),
    },
  });
}

export async function getKycLink(kycLinkId: string): Promise<BridgeKycLink> {
  return bridgeRequest<BridgeKycLink>(`/kyc_links/${kycLinkId}`);
}

export function isKycApproved(link: BridgeKycLink): boolean {
  return link.kyc_status?.toLowerCase() === "approved";
}

/* -------------------------------------------------------------------------- */
/*                                   Wallets                                  */
/* -------------------------------------------------------------------------- */

export type BridgeWallet = {
  id: string;
  chain: string;
  address: string;
  tags?: string[];
  created_at?: string;
};

export type CreateWalletInput = {
  customerId: string;
  chain?: string;
  /** Free-form tags to help correlate the wallet back to an app entity. */
  tags?: string[];
  /** Stable key so concurrent provisioning attempts don't create duplicates. */
  idempotencyKey?: string;
};

export async function createWallet(input: CreateWalletInput): Promise<BridgeWallet> {
  return bridgeRequest<BridgeWallet>(`/customers/${input.customerId}/wallets`, {
    method: "POST",
    idempotencyKey: input.idempotencyKey,
    body: {
      chain: input.chain ?? process.env.BRIDGE_DEFAULT_CHAIN ?? "base",
      ...(input.tags ? { tags: input.tags } : {}),
    },
  });
}

export async function listWallets(customerId: string): Promise<BridgeWallet[]> {
  const response = await bridgeRequest<{ data?: BridgeWallet[] }>(
    `/customers/${customerId}/wallets`
  );
  return response.data ?? [];
}

export type BridgeWalletBalance = {
  currency: string;
  balance: string;
  chain?: string;
  contract_address?: string;
};

export type BridgeWalletDetail = BridgeWallet & {
  balances?: BridgeWalletBalance[];
};

export async function getWallet(
  customerId: string,
  walletId: string
): Promise<BridgeWalletDetail> {
  return bridgeRequest<BridgeWalletDetail>(`/customers/${customerId}/wallets/${walletId}`);
}

/**
 * Returns the wallet's balance for the configured transfer currency (USDC by
 * default) as a decimal string, or "0" when no matching balance is reported.
 */
export function getWalletCurrencyBalance(wallet: BridgeWalletDetail): string {
  const currency = (process.env.BRIDGE_TRANSFER_CURRENCY ?? "usdc").toLowerCase();
  return getWalletBalanceForCurrency(wallet, currency);
}

/** Balance of a specific currency held in the wallet, as a decimal string. */
export function getWalletBalanceForCurrency(
  wallet: BridgeWalletDetail,
  currency: string
): string {
  const c = currency.toLowerCase();
  const match = wallet.balances?.find((b) => b.currency?.toLowerCase() === c);
  return match?.balance ?? "0";
}

/* -------------------------------------------------------------------------- */
/*                              Virtual Accounts                              */
/* -------------------------------------------------------------------------- */

/**
 * A Bridge virtual account gives the customer a US bank account number +
 * routing number. Funds wired/ACH'd to it are auto-converted to stablecoin and
 * delivered to the linked Bridge wallet (the "Receive via bank" experience).
 */
export type BridgeVirtualAccount = {
  id: string;
  status?: string;
  source_deposit_instructions?: {
    bank_name?: string;
    bank_address?: string;
    bank_beneficiary_name?: string;
    bank_account_number?: string;
    bank_routing_number?: string;
    routing_number?: string;
    account_number?: string;
    payment_rail?: string;
    payment_rails?: string[];
  };
};

export type CreateVirtualAccountInput = {
  customerId: string;
  walletId?: string;
  chain?: string;
  currency?: string;
  idempotencyKey?: string;
};

export async function createVirtualAccount(
  input: CreateVirtualAccountInput
): Promise<BridgeVirtualAccount> {
  const chain = input.chain ?? process.env.BRIDGE_DEFAULT_CHAIN ?? "base";
  const currency = input.currency ?? process.env.BRIDGE_TRANSFER_CURRENCY ?? "usdc";

  return bridgeRequest<BridgeVirtualAccount>(
    `/customers/${input.customerId}/virtual_accounts`,
    {
      method: "POST",
      idempotencyKey: input.idempotencyKey,
      body: {
        source: { currency: "usd" },
        destination: {
          payment_rail: chain,
          currency,
          ...(input.walletId ? { bridge_wallet_id: input.walletId } : {}),
        },
      },
    }
  );
}

export async function listVirtualAccounts(
  customerId: string
): Promise<BridgeVirtualAccount[]> {
  const response = await bridgeRequest<{ data?: BridgeVirtualAccount[] }>(
    `/customers/${customerId}/virtual_accounts`
  );
  return response.data ?? [];
}

/* -------------------------------------------------------------------------- */
/*                                    Cards                                    */
/* -------------------------------------------------------------------------- */

/**
 * Bridge issues stablecoin-backed Visa cards that spend just-in-time from a
 * linked wallet. The customer needs the `cards` endorsement (full KYC), and the
 * Cards product must be enabled on the Bridge account.
 */
export type BridgeCardAccount = {
  id: string;
  status?: string;
  type?: string;
  brand?: string;
  last_4?: string;
  card_details?: {
    brand?: string;
    last_4?: string;
    last4?: string;
    expiry_month?: string | number;
    expiry_year?: string | number;
  };
};

/** Best-effort request for the `cards` endorsement on a customer. */
export async function requestCardsEndorsement(customerId: string): Promise<void> {
  await bridgeRequest(`/customers/${customerId}/endorsements`, {
    method: "POST",
    idempotencyKey: `cards-endorse-${customerId}`,
    body: { endorsement: "cards" },
  });
}

export type CreateCardAccountInput = {
  customerId: string;
  walletId?: string;
  walletAddress: string;
  chain?: string;
  currency?: string;
  idempotencyKey?: string;
};

export async function createCardAccount(
  input: CreateCardAccountInput
): Promise<BridgeCardAccount> {
  const chain = input.chain ?? process.env.BRIDGE_DEFAULT_CHAIN ?? "base";
  const currency = input.currency ?? process.env.BRIDGE_TRANSFER_CURRENCY ?? "usdc";

  return bridgeRequest<BridgeCardAccount>(`/customers/${input.customerId}/card_accounts`, {
    method: "POST",
    idempotencyKey: input.idempotencyKey,
    body: {
      currency,
      chain,
      crypto_account: {
        type: input.walletId ? "bridge_wallet" : "standard",
        address: input.walletAddress,
        ...(input.walletId ? { bridge_wallet_id: input.walletId } : {}),
      },
    },
  });
}

export async function listCardAccounts(customerId: string): Promise<BridgeCardAccount[]> {
  const response = await bridgeRequest<{ data?: BridgeCardAccount[] }>(
    `/customers/${customerId}/card_accounts`
  );
  return response.data ?? [];
}

/* -------------------------------------------------------------------------- */
/*                                  Transfers                                 */
/* -------------------------------------------------------------------------- */

export type TransferEndpoint = {
  payment_rail: string; // e.g. "base"
  currency: string; // e.g. "usdc"
  /** Provide for an external/on-chain destination. */
  to_address?: string;
  from_address?: string;
  /** Provide for a Bridge-custodied wallet source/destination. */
  bridge_wallet_id?: string;
};

export type BridgeTransfer = {
  id: string;
  state: string;
  amount: string;
  source_deposit_instructions?: Record<string, unknown>;
  destination?: Record<string, unknown>;
  receipt?: {
    destination_tx_hash?: string;
    source_tx_hash?: string;
  };
};

export type CreateTransferInput = {
  amount: string; // decimal string in the transfer currency (e.g. "12.50")
  onBehalfOf: string; // Bridge customer id
  source: TransferEndpoint;
  destination: TransferEndpoint;
  idempotencyKey?: string;
};

export async function createTransfer(input: CreateTransferInput): Promise<BridgeTransfer> {
  return bridgeRequest<BridgeTransfer>("/transfers", {
    method: "POST",
    idempotencyKey: input.idempotencyKey,
    body: {
      amount: input.amount,
      on_behalf_of: input.onBehalfOf,
      source: input.source,
      destination: input.destination,
    },
  });
}

export async function getTransfer(transferId: string): Promise<BridgeTransfer> {
  return bridgeRequest<BridgeTransfer>(`/transfers/${transferId}`);
}

export function getTransferTxHash(transfer: BridgeTransfer): string | null {
  return (
    transfer.receipt?.destination_tx_hash ??
    transfer.receipt?.source_tx_hash ??
    null
  );
}
