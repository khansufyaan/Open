import { describe, expect, it } from "vitest";

import {
  getCustomerKycStatus,
  isCustomerApproved,
  isKycApproved,
  getWalletCurrencyBalance,
  getTransferTxHash,
} from "@/lib/bridge/server";

describe("KYC status mapping", () => {
  it("reads kyc_status, falling back to status then under_review", () => {
    expect(getCustomerKycStatus({ id: "c", kyc_status: "approved" })).toBe("approved");
    expect(getCustomerKycStatus({ id: "c", status: "pending" })).toBe("pending");
    expect(getCustomerKycStatus({ id: "c" })).toBe("under_review");
  });

  it("treats approved/active/complete (any case) as approved", () => {
    for (const s of ["approved", "ACTIVE", "Complete", "completed"]) {
      expect(isCustomerApproved({ id: "c", kyc_status: s })).toBe(true);
    }
  });

  it("is not approved for review/rejected states", () => {
    expect(isCustomerApproved({ id: "c", kyc_status: "under_review" })).toBe(false);
    expect(isCustomerApproved({ id: "c", status: "rejected" })).toBe(false);
    expect(isCustomerApproved({ id: "c" })).toBe(false);
  });

  it("approves via an approved endorsement even if top-level status isn't", () => {
    expect(
      isCustomerApproved({
        id: "c",
        kyc_status: "under_review",
        endorsements: [{ status: "approved" }],
      })
    ).toBe(true);
  });

  it("isKycApproved only matches an approved link (case-insensitive)", () => {
    expect(isKycApproved({ kyc_status: "approved" })).toBe(true);
    expect(isKycApproved({ kyc_status: "APPROVED" })).toBe(true);
    expect(isKycApproved({ kyc_status: "pending" })).toBe(false);
    expect(isKycApproved({})).toBe(false);
  });
});

describe("wallet balance selection", () => {
  it("picks the configured currency balance (case-insensitive), else 0", () => {
    const wallet = {
      id: "w",
      chain: "base",
      address: "0x",
      balances: [
        { currency: "USDC", balance: "12.50" },
        { currency: "eth", balance: "1.0" },
      ],
    };
    expect(getWalletCurrencyBalance(wallet)).toBe("12.50");
    expect(getWalletCurrencyBalance({ id: "w", chain: "base", address: "0x" })).toBe("0");
  });
});

describe("transfer tx hash extraction", () => {
  it("prefers destination, then source, else null", () => {
    expect(
      getTransferTxHash({
        id: "t",
        state: "completed",
        receipt: { destination_tx_hash: "0xdest", source_tx_hash: "0xsrc" },
      })
    ).toBe("0xdest");
    expect(
      getTransferTxHash({ id: "t", state: "completed", receipt: { source_tx_hash: "0xsrc" } })
    ).toBe("0xsrc");
    expect(getTransferTxHash({ id: "t", state: "pending" })).toBeNull();
  });
});
