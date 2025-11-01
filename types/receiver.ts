export type PlaidAchAccount = {
  accountId: string;
  accountNumber: string;
  routingNumber: string;
  wireRoutingNumber?: string | null;
  mask?: string | null;
  name?: string | null;
  officialName?: string | null;
  type?: string | null;
  subtype?: string | null;
};

export type PlaidIdentitySnapshot = {
  names: string[];
  emails: string[];
  phones: string[];
  addresses: Array<{
    street: string;
    city: string;
    region: string;
    postal_code: string;
    country: string;
  }>;
  achAccounts: PlaidAchAccount[];
};

export type TransferSummary = {
  transferId: string;
  walletId: string | null;
  walletAddress: string | null;
  depositAddress?: string | null;
  amount: string;
  status: string;
  depositMethod: string;
  createdAt: string;
  fundingStatus?: string | null;
  fundingTxHash?: string | null;
  recipientWalletAddress?: string | null;
  recipientWalletId?: string | null;
  recipientWalletName?: string | null;
  claimTxHash?: string | null;
  claimedAt?: string | null;
  withdrawalTxHash?: string | null;
  withdrawalTargetAddress?: string | null;
  withdrawnAt?: string | null;
};
