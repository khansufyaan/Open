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
  return (
    process.env.BRIDGE_API_BASE_URL ??
    process.env.NEXT_PUBLIC_BRIDGE_API_BASE_URL ??
    DEFAULT_BASE_URL
  ).replace(/\/$/, "");
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
  const payload = text ? safeJsonParse(text) : null;

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

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Customers                                 */
/* -------------------------------------------------------------------------- */

export type BridgeCustomer = {
  id: string;
  type?: string;
  email?: string;
  status?: string;
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
    body,
  });
}

export async function getCustomer(customerId: string): Promise<BridgeCustomer> {
  return bridgeRequest<BridgeCustomer>(`/customers/${customerId}`);
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
};

const DEFAULT_CHAIN = process.env.BRIDGE_DEFAULT_CHAIN ?? "base";

export async function createWallet(input: CreateWalletInput): Promise<BridgeWallet> {
  return bridgeRequest<BridgeWallet>(`/customers/${input.customerId}/wallets`, {
    method: "POST",
    body: {
      chain: input.chain ?? DEFAULT_CHAIN,
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
