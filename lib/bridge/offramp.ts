import { randomUUID } from "crypto";

import {
  createExternalAccount,
  listExternalAccounts,
  getExternalAccountLast4,
  updateCustomerAddress,
  createTransfer,
  getTransferTxHash,
  isBridgeConfigured,
  BridgeRequestError,
  type CustomerAddress,
} from "@/lib/bridge/server";
import { updateUser } from "@/lib/db/store";
import { recordAudit } from "@/lib/audit";
import { captureError } from "@/lib/observability";
import { last4 } from "@/lib/validation";
import type { ExternalAccountDetails, TransactionRecord, UserRecord } from "@/types/user";

/**
 * Cash out / "burn": convert a stablecoin balance to USD and pay it out to the
 * user's linked bank account via a Bridge off-ramp transfer. Requires a linked
 * external account first. Mirrors the rest of the app: real Bridge when
 * configured, otherwise a clearly-labeled demo so the flow is testable.
 */

const CHAIN = process.env.BRIDGE_DEFAULT_CHAIN ?? "base";
const FIAT_RAIL = process.env.BRIDGE_OFFRAMP_RAIL ?? "ach";

export type LinkBankInput = {
  accountHolder: string;
  accountNumber: string;
  routingNumber: string;
  bankName?: string;
  /** Required by Bridge for off-ramp; set on the customer before linking. */
  address?: CustomerAddress;
};

export async function linkBankAccount(
  user: UserRecord,
  input: LinkBankInput
): Promise<ExternalAccountDetails> {
  // Demo when Bridge isn't usable.
  if (!isBridgeConfigured() || !user.bridgeCustomerId) {
    const account: ExternalAccountDetails = {
      id: `demo_ext_${user.userId.slice(-8)}`,
      bankName: input.bankName,
      last4: last4(input.accountNumber),
      accountHolder: input.accountHolder,
      source: "demo",
    };
    await updateUser(user.userId, { externalAccount: account });
    return account;
  }

  // Bridge requires a residential address on the customer before an external
  // account can be created. Set it first when provided.
  if (input.address) {
    try {
      await updateCustomerAddress(user.bridgeCustomerId, input.address);
    } catch (error) {
      captureError("LinkBank.address", error, { userId: user.userId });
      throw error;
    }
  }

  const created = await createExternalAccount({
    customerId: user.bridgeCustomerId,
    accountOwnerName: input.accountHolder,
    accountNumber: input.accountNumber,
    routingNumber: input.routingNumber,
    bankName: input.bankName,
    idempotencyKey: `extacct-${user.userId}-${last4(input.accountNumber)}`,
  });

  const account: ExternalAccountDetails = {
    id: created.id,
    bankName: created.bank_name ?? input.bankName,
    last4: getExternalAccountLast4(created) ?? last4(input.accountNumber),
    accountHolder: created.account_owner_name ?? input.accountHolder,
    source: "bridge",
  };
  await updateUser(user.userId, { externalAccount: account });
  return account;
}

export type BurnInput = {
  currency: string; // stablecoin to cash out
  amount: string;
  requestId?: string; // idempotency
};

export type BurnResult = { transaction: TransactionRecord; demo?: boolean };

export async function burnToFiat(user: UserRecord, input: BurnInput): Promise<BurnResult> {
  const currency = input.currency.toLowerCase();
  const timestamp = new Date().toISOString();
  const idemId = input.requestId ?? randomUUID();

  const recordTransaction = async (tx: TransactionRecord) => {
    await updateUser(user.userId, (current) => ({
      transactions: [tx, ...(current?.transactions ?? [])].slice(0, 50),
    }));
  };

  // --- Demo mode ---
  if (
    !isBridgeConfigured() ||
    !user.bridgeCustomerId ||
    !user.bridgeWalletId ||
    user.externalAccount?.source === "demo"
  ) {
    const tx: TransactionRecord = {
      id: randomUUID(),
      direction: "withdraw",
      amount: input.amount,
      currency: currency.toUpperCase(),
      counterparty: user.externalAccount?.last4 ? `Bank ••${user.externalAccount.last4}` : "Bank",
      status: "demo_submitted",
      txHash: null,
      createdAt: timestamp,
    };
    await recordTransaction(tx);
    await recordAudit({
      userId: user.userId,
      action: "burn.demo_submitted",
      detail: { amount: input.amount, currency: currency.toUpperCase() },
    });
    return { transaction: tx, demo: true };
  }

  try {
    const transfer = await createTransfer({
      amount: input.amount,
      onBehalfOf: user.bridgeCustomerId,
      idempotencyKey: `burn-${user.userId}-${idemId}`,
      source: { payment_rail: CHAIN, currency, bridge_wallet_id: user.bridgeWalletId },
      destination: {
        payment_rail: FIAT_RAIL,
        currency: "usd",
        external_account_id: user.externalAccount?.id,
      },
    });

    const tx: TransactionRecord = {
      id: transfer.id,
      direction: "withdraw",
      amount: input.amount,
      currency: currency.toUpperCase(),
      counterparty: user.externalAccount?.last4 ? `Bank ••${user.externalAccount.last4}` : "Bank",
      status: transfer.state,
      txHash: getTransferTxHash(transfer),
      createdAt: timestamp,
    };
    await recordTransaction(tx);
    await recordAudit({
      userId: user.userId,
      action: "burn.submitted",
      detail: { transferId: transfer.id, amount: input.amount, currency: currency.toUpperCase() },
    });
    return { transaction: tx };
  } catch (error) {
    if (!(error instanceof BridgeRequestError)) {
      captureError("Burn", error, { userId: user.userId });
    }
    throw error;
  }
}

export async function refreshLinkedBank(user: UserRecord): Promise<ExternalAccountDetails | null> {
  if (!isBridgeConfigured() || !user.bridgeCustomerId) return user.externalAccount ?? null;
  try {
    const accounts = await listExternalAccounts(user.bridgeCustomerId);
    const first = accounts[0];
    if (!first) return user.externalAccount ?? null;
    return {
      id: first.id,
      bankName: first.bank_name,
      last4: getExternalAccountLast4(first),
      accountHolder: first.account_owner_name,
      source: "bridge",
    };
  } catch {
    return user.externalAccount ?? null;
  }
}
