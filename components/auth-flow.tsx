"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useTurnkey } from "@turnkey/sdk-react";
import type { Session } from "@turnkey/sdk-types";
import { CheckCircle2, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TurnkeyLoginForm } from "@/components/turnkey-login-form";
import { PlaidConnectButton } from "@/components/plaid-connect-button";
import { base } from "viem/chains";

const TURNKEY_READY = Boolean(
  process.env.NEXT_PUBLIC_TURNKEY_API_BASE_URL && process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID
);

type PlaidAchAccount = {
  accountId: string;
  accountNumber: string;
  routingNumber: string;
  wireRoutingNumber?: string | null;
  mask?: string | null;
  name?: string | null;
};

type PlaidIdentitySnapshot = {
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

type TransferSummary = {
  transferId: string;
  walletId: string;
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
  withdrawalTxHash?: string | null;
  withdrawalTargetAddress?: string | null;
  withdrawnAt?: string | null;
};

type WithdrawalQuote = {
  gasLimit: string;
  maxFeePerGasWei: string;
  maxPriorityFeePerGasWei: string;
  totalFeeWei: string;
  totalFeeEth: string;
  walletBalanceWei: string;
  walletBalanceEth: string;
  topUpWei: string;
  topUpEth: string;
  hasSufficientBalance: boolean;
  destination: string;
  chainId: number;
};

const DIGIT_REGEX = /\D+/g;
const HEX_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

const BASE_CHAIN_ID = base.id;
const BASE_CHAIN_HEX = `0x${BASE_CHAIN_ID.toString(16)}` as const;

function sanitizeDigits(value: string | null | undefined): string {
  return typeof value === "string" ? value.replace(DIGIT_REGEX, "") : "";
}

function bigintToHex(value: bigint): string {
  return `0x${value.toString(16)}`;
}

function formatEth(value: string): string {
  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return value;
  }

  return numericValue.toLocaleString(undefined, {
    maximumFractionDigits: 6,
  });
}

function getAccountKey(account: PlaidAchAccount): string {
  if (account.accountId) {
    return account.accountId;
  }

  return `${account.routingNumber}:${account.accountNumber}`;
}

function normalizeAchAccounts(accounts: PlaidAchAccount[]): PlaidAchAccount[] {
  return accounts.reduce<PlaidAchAccount[]>((list, account) => {
    const accountNumber = sanitizeDigits(account.accountNumber);
    const routingNumber = sanitizeDigits(account.routingNumber);

    if (!accountNumber || !routingNumber) {
      return list;
    }

    const mask = account.mask ?? accountNumber.slice(-4);

    list.push({
      accountId: account.accountId,
      accountNumber,
      routingNumber,
      wireRoutingNumber: account.wireRoutingNumber ?? null,
      mask,
      name: account.name ?? null,
    });

    return list;
  }, []);
}

function mergeAchAccounts(
  current: PlaidAchAccount[],
  incoming: PlaidAchAccount[]
): PlaidAchAccount[] {
  const merged = new Map<string, PlaidAchAccount>();

  for (const account of current) {
    merged.set(getAccountKey(account), account);
  }

  for (const account of incoming) {
    merged.set(getAccountKey(account), account);
  }

  return Array.from(merged.values());
}

export function AuthFlow() {
  if (!TURNKEY_READY) {
    return (
      <section className="rounded-3xl border border-slate-200/80 bg-white/70 p-8 text-slate-600 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-300">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Turnkey setup required
        </h2>
        <p className="mt-4 max-w-xl text-lg leading-7">
          Set `NEXT_PUBLIC_TURNKEY_API_BASE_URL` and `NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID` in your
          `.env.local` file to enable the Turnkey login experience.
        </p>
      </section>
    );
  }

  return <TurnkeyAuthContent />;
}

function TurnkeyAuthContent() {
  const { ready: privyReady, authenticated: privyAuthenticated, login: privyLogin, connectWallet: privyConnectWallet, logout: privyLogout } = usePrivy();
  const { wallets: connectedWallets } = useWallets();
  const turnkeyContext = useTurnkey();
  const turnkey = turnkeyContext.turnkey;
  const ALL_ACCOUNTS_KEY = "__ALL__";
  const [authError, setAuthError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [plaidIdentity, setPlaidIdentity] = useState<PlaidIdentitySnapshot | null>(null);
  const [linkedAccounts, setLinkedAccounts] = useState<PlaidAchAccount[]>([]);
  const [selectedAccountKey, setSelectedAccountKey] = useState<string>(ALL_ACCOUNTS_KEY);
  const [transferSummaries, setTransferSummaries] = useState<TransferSummary[]>([]);
  const [isTransfersLoading, setIsTransfersLoading] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [plaidHydrated, setPlaidHydrated] = useState(false);
  const stepsRef = useRef<HTMLDivElement | null>(null);
  const [withdrawInputs, setWithdrawInputs] = useState<Record<string, string>>({});
  const [withdrawLoading, setWithdrawLoading] = useState<Record<string, boolean>>({});
  const [withdrawErrors, setWithdrawErrors] = useState<Record<string, string | null>>({});
  const [withdrawSuccess, setWithdrawSuccess] = useState<Record<string, string | null>>({});
  const [withdrawQuotes, setWithdrawQuotes] = useState<Record<string, WithdrawalQuote | null>>({});
  const [quoteLoading, setQuoteLoading] = useState<Record<string, boolean>>({});
  const [quoteErrors, setQuoteErrors] = useState<Record<string, string | null>>({});
  const [topUpLoading, setTopUpLoading] = useState<Record<string, boolean>>({});
  const [topUpErrors, setTopUpErrors] = useState<Record<string, string | null>>({});
  const [topUpSuccess, setTopUpSuccess] = useState<Record<string, string | null>>({});
  const [walletConnectError, setWalletConnectError] = useState<string | null>(null);
  const [isWalletConnecting, setIsWalletConnecting] = useState(false);

  const selectedAccount =
    selectedAccountKey === ALL_ACCOUNTS_KEY
      ? linkedAccounts[0] ?? null
      : linkedAccounts.find((account) => getAccountKey(account) === selectedAccountKey) ?? null;

  const connectedEvmWallet = useMemo(
    () => connectedWallets.find((wallet) => wallet.type === "ethereum"),
    [connectedWallets]
  );

  const handleScrollToSteps = useCallback(() => {
    stepsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  useEffect(() => {
    const initTable = async () => {
      try {
        await fetch("/api/db/init-table", {
          method: "POST",
        });
      } catch (error) {
        console.error("Failed to initialize table:", error);
      }
    };

    initTable();
  }, []);

  const fetchTransfersForAccounts = useCallback(async (accounts: PlaidAchAccount[]) => {
    if (!accounts || accounts.length === 0) {
      setTransferSummaries([]);
      setTransferError("No bank accounts detected from Plaid verification.");
      return;
    }

    setIsTransfersLoading(true);
    setTransferError(null);

    const uniqueCoordinates = new Map<string, { accountNumber: string; routingNumber: string; last4: string }>();

    for (const account of accounts) {
      const rawAccount = sanitizeDigits(account.accountNumber);
      const rawRouting = sanitizeDigits(account.routingNumber);
      if (!rawAccount || !rawRouting) {
        continue;
      }

      const maskDigits = sanitizeDigits(account.mask);
      const last4 = maskDigits || rawAccount.slice(-4);
      const key = `${rawRouting}:${rawAccount}:${last4}`;

      if (!uniqueCoordinates.has(key)) {
        uniqueCoordinates.set(key, {
          accountNumber: rawAccount,
          routingNumber: rawRouting,
          last4,
        });
      }
    }

    if (uniqueCoordinates.size === 0) {
      setIsTransfersLoading(false);
      setTransferSummaries([]);
      setTransferError("No qualified ACH coordinates returned from Plaid.");
      return;
    }

    try {
      const lookups = await Promise.all(
        Array.from(uniqueCoordinates.values()).map(async ({ accountNumber, routingNumber, last4 }) => {
          const response = await fetch(
            `/api/transfers?accountNumber=${encodeURIComponent(accountNumber)}&routingNumber=${encodeURIComponent(routingNumber)}${last4 ? `&last4=${encodeURIComponent(last4)}` : ""}`
          );

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.message ?? "Failed to load transfers for linked account.");
          }

          return Array.isArray(data.transfers) ? (data.transfers as TransferSummary[]) : [];
        })
      );

      const flattened = lookups.flat().filter((entry): entry is TransferSummary => Boolean(entry));

      const deduped = new Map<string, TransferSummary>();

      for (const item of flattened) {
        if (!item?.transferId) {
          continue;
        }

        deduped.set(item.transferId, {
          ...item,
          walletAddress: item.recipientWalletAddress ?? item.walletAddress ?? null,
        });
      }

      const ordered = Array.from(deduped.values()).sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
      );

      setTransferSummaries(ordered);

      if (ordered.length === 0) {
        setTransferError("No transfers have been allocated to this bank account yet.");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected error loading transfer information.";
      setTransferSummaries([]);
      setTransferError(message);
    } finally {
      setIsTransfersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!turnkey) {
      return;
    }

    let cancelled = false;

    const loadExistingSession = async () => {
      try {
        const activeSession = await turnkey.getSession();

        if (!cancelled && activeSession) {
          setSession(activeSession);
        }
      } catch (error) {
        console.debug("Turnkey session lookup failed", error);
      }
    };

    void loadExistingSession();

    return () => {
      cancelled = true;
    };
  }, [turnkey]);

  useEffect(() => {
    if (!session || plaidHydrated) {
      return;
    }

    let cancelled = false;

    const hydratePlaidData = async () => {
      try {
        const response = await fetch(`/api/db/user?userId=${encodeURIComponent(session.userId)}`);

        if (!response.ok) {
          return;
        }

        const data = await response.json();
        const user = data.user as Record<string, unknown>;

        const verificationCompleted = Boolean(user?.plaidVerificationCompleted);
        const storedAccountsRaw = Array.isArray(user?.plaidAchAccounts)
          ? (user.plaidAchAccounts as PlaidAchAccount[])
          : [];

        if (!verificationCompleted || storedAccountsRaw.length === 0) {
          return;
        }

        const normalizedAccounts = normalizeAchAccounts(storedAccountsRaw);

        if (normalizedAccounts.length === 0) {
          return;
        }

        const mergedAccounts = mergeAchAccounts([], normalizedAccounts);

        const identitySnapshot = (user.plaidIdentitySnapshot ?? null) as
          | PlaidIdentitySnapshot
          | null;

        const fallbackIdentity: PlaidIdentitySnapshot = {
          names:
            Array.isArray(identitySnapshot?.names) && identitySnapshot.names.length > 0
              ? identitySnapshot.names
              : user?.plaidVerifiedName
              ? [String(user.plaidVerifiedName)]
              : [],
          emails:
            Array.isArray(identitySnapshot?.emails) && identitySnapshot.emails.length > 0
              ? identitySnapshot.emails
              : user?.plaidVerifiedEmail
              ? [String(user.plaidVerifiedEmail)]
              : [],
          phones:
            Array.isArray(identitySnapshot?.phones) && identitySnapshot.phones.length > 0
              ? identitySnapshot.phones
              : user?.plaidVerifiedPhone
              ? [String(user.plaidVerifiedPhone)]
              : [],
          addresses:
            Array.isArray(identitySnapshot?.addresses) && identitySnapshot.addresses.length > 0
              ? identitySnapshot.addresses
              : user?.plaidVerifiedAddress
              ? [user.plaidVerifiedAddress as PlaidIdentitySnapshot["addresses"][number]]
              : [],
          achAccounts: mergedAccounts,
        };

        if (cancelled) {
          return;
        }

        setPlaidIdentity(fallbackIdentity);
        setLinkedAccounts(mergedAccounts);
        setSelectedAccountKey(ALL_ACCOUNTS_KEY);
      } catch (error) {
        console.error("Failed to hydrate Plaid verification:", error);
      } finally {
        if (!cancelled) {
          setPlaidHydrated(true);
        }
      }
    };

    void hydratePlaidData();

    return () => {
      cancelled = true;
    };
  }, [session, plaidHydrated, fetchTransfersForAccounts, ALL_ACCOUNTS_KEY]);

  useEffect(() => {
    const accountsToFetch =
      selectedAccountKey === ALL_ACCOUNTS_KEY
        ? linkedAccounts
        : linkedAccounts.filter((account) => getAccountKey(account) === selectedAccountKey);

    if (accountsToFetch.length === 0) {
      if (linkedAccounts.length > 0 && selectedAccountKey !== ALL_ACCOUNTS_KEY) {
        setSelectedAccountKey(ALL_ACCOUNTS_KEY);
      }
      if (linkedAccounts.length === 0) {
        setTransferSummaries([]);
      }
      return;
    }

    void fetchTransfersForAccounts(accountsToFetch);
  }, [selectedAccountKey, linkedAccounts, fetchTransfersForAccounts, ALL_ACCOUNTS_KEY]);

  const handleAuthSuccess = async (email: string) => {
    if (!turnkey) {
      setAuthError("Turnkey client is not ready. Check your configuration and try again.");
      return;
    }

    try {
      const activeSession = await turnkey.getSession();

      if (!activeSession) {
        setAuthError("Authentication succeeded, but no active session was returned.");
        setSession(null);
        return;
      }

      setSession(activeSession);
      setAuthError(null);

      try {
        await fetch("/api/db/user", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: activeSession.userId,
            email,
            turnkeySignInCompleted: true,
          }),
        });
      } catch (dbError) {
        console.error("Failed to store user data:", dbError);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to fetch the active Turnkey session.";
      setAuthError(message);
    }
  };

  const handleAuthError = (message: string) => {
    setAuthError(message || "Something went wrong while signing in.");
  };

  const handleLogout = async () => {
    try {
      await turnkey?.logout();
    } catch (error) {
      console.error("Turnkey logout failed", error);
    } finally {
      setSession(null);
      setPlaidIdentity(null);
      setLinkedAccounts([]);
      setSelectedAccountKey(ALL_ACCOUNTS_KEY);
      setPlaidHydrated(false);
      setAuthError(null);
      setTransferSummaries([]);
      setTransferError(null);
      setWithdrawInputs({});
      setWithdrawLoading({});
      setWithdrawErrors({});
      setWithdrawSuccess({});
    }
  };

  const handlePlaidSuccess = async (identityData: PlaidIdentitySnapshot) => {
    const normalizedAccounts = normalizeAchAccounts(identityData.achAccounts);
    const mergedAccounts = mergeAchAccounts(linkedAccounts, normalizedAccounts);

    const nextSelectedKey =
      selectedAccountKey === ALL_ACCOUNTS_KEY
        ? ALL_ACCOUNTS_KEY
        : mergedAccounts.some((account) => getAccountKey(account) === selectedAccountKey)
        ? selectedAccountKey
        : mergedAccounts.length > 0
        ? getAccountKey(mergedAccounts[0])
        : ALL_ACCOUNTS_KEY;

    setLinkedAccounts(mergedAccounts);
    setSelectedAccountKey(nextSelectedKey);
    setPlaidIdentity({
      ...identityData,
      achAccounts: mergedAccounts,
    });
    setAuthError(null);

    if (session) {
      try {
        await fetch("/api/db/user", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: session.userId,
            plaidVerifiedName: identityData.names[0],
            plaidVerifiedEmail: identityData.emails[0],
            plaidVerifiedPhone: identityData.phones[0],
            plaidVerifiedAddress: identityData.addresses[0],
            plaidVerificationCompleted: true,
            plaidVerifiedAccountMask: mergedAccounts[0]?.mask,
            plaidVerifiedRoutingNumber: mergedAccounts[0]?.routingNumber,
            plaidAchAccounts: mergedAccounts,
            plaidIdentitySnapshot: {
              names: identityData.names,
              emails: identityData.emails,
              phones: identityData.phones,
              addresses: identityData.addresses,
            },
            plaidLastLinkedAt: new Date().toISOString(),
          }),
        });
      } catch (dbError) {
        console.error("Failed to store Plaid data:", dbError);
      }
    }
  };

  const handlePlaidError = (error: string) => {
    setAuthError(error);
    setTransferSummaries([]);
    setTransferError(error);
  };

  const fetchWithdrawalQuote = useCallback(
    async (transferId: string, targetAddress: string) => {
      setQuoteLoading((previous) => ({
        ...previous,
        [transferId]: true,
      }));
      setQuoteErrors((previous) => ({
        ...previous,
        [transferId]: null,
      }));

      try {
        const response = await fetch(
          `/api/transfers/${transferId}/withdraw?targetAddress=${encodeURIComponent(targetAddress)}`
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message ?? data.error ?? "Unable to estimate gas for withdrawal.");
        }

        const nextQuote: WithdrawalQuote = {
          gasLimit: data.gasLimit,
          maxFeePerGasWei: data.maxFeePerGasWei,
          maxPriorityFeePerGasWei: data.maxPriorityFeePerGasWei,
          totalFeeWei: data.totalFeeWei,
          totalFeeEth: data.totalFeeEth,
          walletBalanceWei: data.walletBalanceWei,
          walletBalanceEth: data.walletBalanceEth,
          topUpWei: data.topUpWei,
          topUpEth: data.topUpEth,
          hasSufficientBalance: Boolean(data.hasSufficientBalance),
          destination: data.destination,
          chainId: data.chainId,
        };

        setWithdrawQuotes((previous) => ({
          ...previous,
          [transferId]: nextQuote,
        }));
      } catch (error) {
        console.error("Failed to compute withdrawal quote", error);
        setQuoteErrors((previous) => ({
          ...previous,
          [transferId]: error instanceof Error ? error.message : "Unable to estimate gas for withdrawal.",
        }));
        setWithdrawQuotes((previous) => ({
          ...previous,
          [transferId]: null,
        }));
      } finally {
        setQuoteLoading((previous) => ({
          ...previous,
          [transferId]: false,
        }));
      }
    },
    []
  );

  const handleWithdrawInputChange = useCallback(
    (transferId: string, value: string) => {
      setWithdrawInputs((previous) => ({
        ...previous,
        [transferId]: value,
      }));
      setWithdrawErrors((previous) => ({
        ...previous,
        [transferId]: null,
      }));
      setWithdrawSuccess((previous) => ({
        ...previous,
        [transferId]: null,
      }));
      setQuoteErrors((previous) => ({
        ...previous,
        [transferId]: null,
      }));
      setTopUpErrors((previous) => ({
        ...previous,
        [transferId]: null,
      }));
      setTopUpSuccess((previous) => ({
        ...previous,
        [transferId]: null,
      }));

      const normalized = value.trim();

      if (HEX_ADDRESS_REGEX.test(normalized)) {
        void fetchWithdrawalQuote(transferId, normalized);
      } else {
        setWithdrawQuotes((previous) => {
          const next = { ...previous };
          delete next[transferId];
          return next;
        });
      }
    },
    [fetchWithdrawalQuote]
  );

  const handleConnectWallet = useCallback(async () => {
    setWalletConnectError(null);

    if (!privyReady) {
      setWalletConnectError("Wallet connections are still initializing. Please try again shortly.");
      return;
    }

    setIsWalletConnecting(true);

    try {
      if (!privyAuthenticated) {
        await privyLogin({ loginMethods: ["wallet"] });
      }

      await privyConnectWallet();
    } catch (error) {
      console.error("Wallet connection failed", error);
      setWalletConnectError(
        error instanceof Error ? error.message : "Failed to connect wallet. Please retry."
      );
    } finally {
      setIsWalletConnecting(false);
    }
  }, [privyReady, privyAuthenticated, privyLogin, privyConnectWallet]);

  const handleDisconnectWallet = useCallback(async () => {
    setWalletConnectError(null);

    if (!privyReady) {
      setWalletConnectError("Wallet system is not ready. Please try again in a moment.");
      return;
    }

    try {
      await privyLogout();
    } catch (error) {
      console.error("Wallet disconnect failed", error);
      setWalletConnectError(
        error instanceof Error ? error.message : "Failed to disconnect wallet. Please retry."
      );
    }
  }, [privyReady, privyLogout]);

  const handleTopUp = useCallback(
    async (summary: TransferSummary) => {
      const quote = withdrawQuotes[summary.transferId];
      const destinationInput = (withdrawInputs[summary.transferId] ?? "").trim();

      if (!quote) {
        setTopUpErrors((previous) => ({
          ...previous,
          [summary.transferId]: "Enter a valid destination address to estimate gas first.",
        }));
        return;
      }

      const requiredWei = BigInt(quote.topUpWei);

      if (requiredWei <= BigInt(0)) {
        setTopUpErrors((previous) => ({
          ...previous,
          [summary.transferId]: "Managed wallet already holds enough ETH for gas.",
        }));
        return;
      }

      const fundingWallet = connectedEvmWallet;

      if (!fundingWallet) {
        setTopUpErrors((previous) => ({
          ...previous,
          [summary.transferId]: "Connect an Ethereum wallet to top up gas.",
        }));
        return;
      }

      if (!summary.walletAddress) {
        setTopUpErrors((previous) => ({
          ...previous,
          [summary.transferId]: "Managed wallet is not yet provisioned. Try again shortly.",
        }));
        return;
      }

      setTopUpLoading((previous) => ({
        ...previous,
        [summary.transferId]: true,
      }));
      setTopUpErrors((previous) => ({
        ...previous,
        [summary.transferId]: null,
      }));
      setTopUpSuccess((previous) => ({
        ...previous,
        [summary.transferId]: null,
      }));

      try {
        const currentChain = fundingWallet.chainId?.startsWith("eip155:")
          ? Number(fundingWallet.chainId.split(":")[1])
          : null;

        if (currentChain !== BASE_CHAIN_ID) {
          await fundingWallet.switchChain(BASE_CHAIN_HEX);
        }

        const provider = await fundingWallet.getEthereumProvider();

        const txHash = (await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: fundingWallet.address,
              to: summary.walletAddress,
              value: bigintToHex(requiredWei),
            },
          ],
        })) as string;

        setTopUpSuccess((previous) => ({
          ...previous,
          [summary.transferId]: txHash,
        }));

        if (HEX_ADDRESS_REGEX.test(destinationInput)) {
          await fetchWithdrawalQuote(summary.transferId, destinationInput);
        }
      } catch (error) {
        console.error("Top-up transaction failed", error);
        setTopUpErrors((previous) => ({
          ...previous,
          [summary.transferId]:
            error instanceof Error ? error.message : "Failed to send top-up transaction.",
        }));
      } finally {
        setTopUpLoading((previous) => ({
          ...previous,
          [summary.transferId]: false,
        }));
      }
    },
    [connectedEvmWallet, fetchWithdrawalQuote, withdrawInputs, withdrawQuotes]
  );

  const handleWithdraw = useCallback(
    async (summary: TransferSummary) => {
      const destinationInput = (withdrawInputs[summary.transferId] ?? "").trim();

      if (!HEX_ADDRESS_REGEX.test(destinationInput)) {
        setWithdrawErrors((previous) => ({
          ...previous,
          [summary.transferId]: "Enter a valid Base wallet address (0x…).",
        }));
        return;
      }

      setWithdrawLoading((previous) => ({
        ...previous,
        [summary.transferId]: true,
      }));
      setWithdrawErrors((previous) => ({
        ...previous,
        [summary.transferId]: null,
      }));
      setWithdrawSuccess((previous) => ({
        ...previous,
        [summary.transferId]: null,
      }));

      try {
        const response = await fetch(`/api/transfers/${summary.transferId}/withdraw`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            targetAddress: destinationInput,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message ?? data.error ?? "Withdrawal failed.");
        }

        setWithdrawSuccess((previous) => ({
          ...previous,
          [summary.transferId]: data.txHash as string,
        }));

        setWithdrawQuotes((previous) => {
          const next = { ...previous };
          delete next[summary.transferId];
          return next;
        });
        setQuoteErrors((previous) => ({
          ...previous,
          [summary.transferId]: null,
        }));
        setTopUpErrors((previous) => ({
          ...previous,
          [summary.transferId]: null,
        }));
        setTopUpSuccess((previous) => ({
          ...previous,
          [summary.transferId]: null,
        }));

        setWithdrawInputs((previous) => ({
          ...previous,
          [summary.transferId]: "",
        }));

        const accountsToRefetch =
          selectedAccountKey === ALL_ACCOUNTS_KEY
            ? linkedAccounts
            : linkedAccounts.filter((account) => getAccountKey(account) === selectedAccountKey);

        if (accountsToRefetch.length > 0) {
          await fetchTransfersForAccounts(accountsToRefetch);
        }
      } catch (error) {
        setWithdrawErrors((previous) => ({
          ...previous,
          [summary.transferId]:
            error instanceof Error ? error.message : "Withdrawal request failed.",
        }));
      } finally {
        setWithdrawLoading((previous) => ({
          ...previous,
          [summary.transferId]: false,
        }));
      }
    },
    [ALL_ACCOUNTS_KEY, fetchTransfersForAccounts, linkedAccounts, selectedAccountKey, withdrawInputs]
  );

  const userIdentifier = useMemo(() => session?.userId ?? "friend", [session]);

  if (!session) {
    return (
      <>
        <section className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
          <div className="mx-auto max-w-2xl space-y-8 text-center">
            <div className="space-y-4">
              <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-5xl">
                Blue Wallet
              </h1>
              <p className="text-lg leading-relaxed text-slate-600 dark:text-slate-400">
                Identity-attested wallets for a compliant crypto world. Verify your identity, create a managed wallet, and stay compliant—all in one streamlined flow.
              </p>
            </div>
            <Button
              size="lg"
              onClick={handleScrollToSteps}
              className="text-base"
            >
              Set up or Login
            </Button>
            {authError && (
              <p className="text-sm text-red-600 dark:text-red-400">{authError}</p>
            )}
          </div>
        </section>

        <section
          ref={stepsRef}
          className="space-y-6 rounded-3xl border border-slate-200/80 bg-white/70 p-10 text-slate-700 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            How it works
          </h2>
          <div className="space-y-6">
            <article className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Step 1 · Verify identity</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Sign in with email OTP and let Turnkey establish a short-lived session for secure actions.
              </p>
              <Button className="mt-4 w-full sm:w-auto" onClick={() => setShowAuthModal(true)}>
                Sign in with Turnkey
              </Button>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Step 2 · Wallet provisioning</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                When a sender submits a transfer, we generate a fresh Turnkey wallet behind the scenes and bind it to the recipient&apos;s bank coordinates.
              </p>
              <Button className="mt-4 w-full sm:w-auto" disabled>
                Wallets appear automatically
              </Button>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Step 3 · Verify bank identity</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Connect your bank account to verify your identity with Plaid for compliance purposes.
              </p>
              <Button className="mt-4 w-full sm:w-auto" disabled>
                Sign in to verify identity
              </Button>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Step 4 · Stay compliant</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Operate with policy controls, audit trails, and identity-linked addresses—all surfaced below.
              </p>
            </article>
          </div>
        </section>

        <TurnkeyLoginForm
          open={showAuthModal}
          onOpenChange={setShowAuthModal}
          onAuthSuccess={handleAuthSuccess}
          onAuthError={handleAuthError}
        />
      </>
    );
  }

  return (
    <>
      <section className="space-y-5 rounded-3xl border border-slate-200/80 bg-white/70 p-10 text-slate-700 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Receive
          </h1>
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            You&apos;re signed in with Turnkey. Everything you need next lives below—create wallets, copy
            addresses, and revisit the blueprint when you need a refresher.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Button size="lg" onClick={handleScrollToSteps}>
            Jump to steps
          </Button>
          <Button variant="outline" size="lg" disabled>
            Wallets auto-provision per transfer
          </Button>
          <Button variant="ghost" size="lg" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
        {authError && (
          <p className="text-sm text-red-600 dark:text-red-400">{authError}</p>
        )}
      </section>

      <section
        ref={stepsRef}
        className="space-y-4 rounded-3xl border border-slate-200/80 bg-white/70 p-6 text-slate-700 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Blueprint
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Step 1 · Verify identity</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Sign in with Turnkey via email OTP. We store the session locally so subsequent actions happen
              without friction.
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Step 2 · Wallet provisioning</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Transfers create new managed wallets automatically. Each ACH destination receives a unique address so senders never see aggregate balances.
            </p>
            <div className="mt-3 flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Wallets generate as transfers arrive
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Step 3 · Verify bank identity</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Connect your bank account to verify your identity. Plaid securely retrieves your personal information
              from your bank for compliance verification.
            </p>
            {plaidIdentity ? (
              <div className="mt-3 space-y-3 text-xs">
                <div className="flex items-center gap-2 font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Bank verified
                </div>
                <div className="rounded-lg border border-slate-200/70 bg-white/50 p-3 dark:border-slate-700/50 dark:bg-slate-800/50">
                  <p className="font-medium text-slate-900 dark:text-white">
                    {plaidIdentity.names[0] ?? "Linked account"}
                  </p>
                  {plaidIdentity.emails[0] && (
                    <p className="mt-1 text-slate-600 dark:text-slate-400">
                      {plaidIdentity.emails[0]}
                    </p>
                  )}
                  {plaidIdentity.phones[0] && (
                    <p className="mt-1 text-slate-600 dark:text-slate-400">
                      {plaidIdentity.phones[0]}
                    </p>
                  )}
                  {plaidIdentity.addresses[0] && (
                    <p className="mt-1 text-slate-600 dark:text-slate-400">
                      {plaidIdentity.addresses[0].street}, {plaidIdentity.addresses[0].city},{" "}
                      {plaidIdentity.addresses[0].region} {plaidIdentity.addresses[0].postal_code}
                    </p>
                  )}
                  {selectedAccount && (
                    <div className="mt-3 grid grid-cols-1 gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <div className="flex items-center justify-between">
                        <span className="uppercase tracking-wide">Routing</span>
                        <span>{selectedAccount.routingNumber}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="uppercase tracking-wide">Account</span>
                        <span>{selectedAccount.accountNumber}</span>
                      </div>
                    </div>
                  )}
                </div>

                {linkedAccounts.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      Linked accounts
                    </p>
                    <div className="space-y-2">
                      {linkedAccounts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setSelectedAccountKey(ALL_ACCOUNTS_KEY)}
                          className={`w-full rounded-lg border px-3 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 ${
                            selectedAccountKey === ALL_ACCOUNTS_KEY
                              ? "border-sky-500 bg-sky-500/10 text-slate-900 dark:border-sky-500 dark:bg-sky-500/10 dark:text-slate-100"
                              : "border-slate-200/70 bg-white/60 hover:border-slate-300 dark:border-slate-700/60 dark:bg-slate-800/40 dark:hover:border-slate-600"
                          }`}
                        >
                          <p className="text-xs font-medium">
                            All linked accounts
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            View combined deposits
                          </p>
                        </button>
                      )}
                      {linkedAccounts.map((account) => {
                        const key = getAccountKey(account);
                        const isSelected =
                          selectedAccountKey === key ||
                          (selectedAccountKey === ALL_ACCOUNTS_KEY && linkedAccounts.length === 1);
                        const mask = account.mask ?? account.accountNumber.slice(-4);

                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setSelectedAccountKey(key)}
                            className={`w-full rounded-lg border px-3 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 ${
                              isSelected
                                ? "border-sky-500 bg-sky-500/10 text-slate-900 dark:border-sky-500 dark:bg-sky-500/10 dark:text-slate-100"
                                : "border-slate-200/70 bg-white/60 hover:border-slate-300 dark:border-slate-700/60 dark:bg-slate-800/40 dark:hover:border-slate-600"
                            }`}
                          >
                            <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                              {`${account.name ?? "Account"} · ••••${mask}`}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              Routing {account.routingNumber}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <PlaidConnectButton
                    userId={session.userId}
                    label={linkedAccounts.length > 0 ? "Link another bank account" : "Connect bank account"}
                    onSuccess={handlePlaidSuccess}
                    onError={handlePlaidError}
                  />
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <PlaidConnectButton
                  userId={session.userId}
                  onSuccess={handlePlaidSuccess}
                  onError={handlePlaidError}
                />
              </div>
            )}
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 md:col-span-2">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Step 4 · Review deposits</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Each bank transfer lands in its own managed wallet. Confirm the allocations below and use the
              wallet addresses for on-chain visibility.
            </p>
            <div className="mt-3 space-y-3">
              {isTransfersLoading ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">Loading deposits…</p>
              ) : transferSummaries.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {transferError ?? "No deposits found for the connected bank account yet."}
                </p>
              ) : (
                <ul className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
                  {transferSummaries.map((summary) => {
                    const destinationValue = (withdrawInputs[summary.transferId] ?? "").trim();
                    const hasValidDestination = HEX_ADDRESS_REGEX.test(destinationValue);
                    const quote = withdrawQuotes[summary.transferId];
                    const quoteMatchesDestination = quote
                      ? quote.destination.toLowerCase() === destinationValue.toLowerCase()
                      : false;
                    const requiresTopUp = quote && quoteMatchesDestination
                      ? BigInt(quote.topUpWei) > BigInt(0)
                      : false;
                    const isQuotePending = Boolean(quoteLoading[summary.transferId]);
                    const withdrawDisabled = (() => {
                      if (withdrawLoading[summary.transferId]) {
                        return true;
                      }

                      if (!hasValidDestination) {
                        return true;
                      }

                      if (!quoteMatchesDestination || requiresTopUp) {
                        return true;
                      }

                      return false;
                    })();

                    return (
                      <li
                        key={summary.transferId}
                        className="rounded-lg border border-slate-200/70 p-3 dark:border-slate-700/50"
                      >
                        <p className="font-medium text-slate-700 dark:text-slate-100">
                          {summary.amount} USDC · {summary.status.toLowerCase()}
                        </p>
                        <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          Transfer {summary.transferId}
                        </p>
                        <dl className="mt-2 space-y-1 text-[11px]">
                          <div className="flex items-start gap-2">
                            <span className="text-slate-400 dark:text-slate-500 uppercase">Vault</span>
                            <span className="truncate">
                              {summary.depositAddress ?? "—"}
                            </span>
                          </div>
                          <div className="flex items-start gap-2">
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-sky-500" />
                            <span className="truncate">
                              {summary.walletAddress ?? "Wallet provisioning in progress"}
                            </span>
                          </div>
                          {summary.recipientWalletName && (
                            <div className="flex items-start gap-2">
                              <span className="text-slate-400 dark:text-slate-500">Label</span>
                              <span className="truncate">{summary.recipientWalletName}</span>
                            </div>
                          )}
                          <div className="flex items-start gap-2">
                            <span className="text-slate-400 dark:text-slate-500">Wallet ID</span>
                            <span className="truncate">{summary.walletId}</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-slate-400 dark:text-slate-500">Recorded</span>
                            <span>
                              {new Date(summary.createdAt).toLocaleString(undefined, {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}
                            </span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-slate-400 dark:text-slate-500">Deposit</span>
                            <span className="capitalize">{summary.depositMethod}</span>
                          </div>
                          {summary.fundingStatus && (
                            <div className="flex items-start gap-2">
                              <span className="text-slate-400 dark:text-slate-500">Funding</span>
                              <span className="capitalize">{summary.fundingStatus.toLowerCase()}</span>
                            </div>
                          )}
                        </dl>
                        {summary.status === "DEPOSITED" ? (
                          <form
                            className="mt-3 space-y-2"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void handleWithdraw(summary);
                            }}
                          >
                            <div className="space-y-1.5">
                              <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                Transfer to Base wallet
                              </p>
                              <Input
                                value={withdrawInputs[summary.transferId] ?? ""}
                                onChange={(event) =>
                                  handleWithdrawInputChange(summary.transferId, event.target.value)
                                }
                                placeholder="0x destination address"
                                className="h-9 text-xs"
                              />
                              {isQuotePending && (
                                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                  Estimating Base gas requirements…
                                </p>
                              )}
                              {quoteErrors[summary.transferId] && (
                                <p className="text-[11px] text-red-500 dark:text-red-400">
                                  {quoteErrors[summary.transferId]}
                                </p>
                              )}
                              {quote && quoteMatchesDestination && (
                                <div className="rounded-md border border-slate-200/60 bg-slate-50/70 p-2 text-[11px] dark:border-slate-700/60 dark:bg-slate-800/40">
                                  <p className="font-medium text-slate-600 dark:text-slate-200">
                                    Gas estimate · {formatEth(quote.totalFeeEth)} ETH
                                  </p>
                                  <p className="text-slate-500 dark:text-slate-400">
                                    Wallet balance: {formatEth(quote.walletBalanceEth)} ETH
                                  </p>
                                  {requiresTopUp ? (
                                    <p className="text-red-500 dark:text-red-400">
                                      Needs {formatEth(quote.topUpEth)} ETH top-up.
                                    </p>
                                  ) : (
                                    <p className="text-emerald-600 dark:text-emerald-400">
                                      Gas funded. Ready to withdraw.
                                    </p>
                                  )}
                                </div>
                              )}
                              <div className="flex flex-wrap items-center gap-2">
                                <Button type="submit" size="sm" disabled={withdrawDisabled}>
                                  {withdrawLoading[summary.transferId] ? "Transferring…" : "Send to Base"}
                                </Button>
                                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                  Network: Base (8453) · Asset: USDC
                                </span>
                              </div>
                              {quote && quoteMatchesDestination && requiresTopUp && (
                                <div className="space-y-1">
                                  {connectedEvmWallet ? (
                                    <div className="flex gap-2">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={Boolean(topUpLoading[summary.transferId])}
                                        onClick={() => void handleTopUp(summary)}
                                      >
                                        {topUpLoading[summary.transferId] ? "Sending top-up…" : "Top up gas from connected wallet"}
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="destructive"
                                        disabled={!privyReady}
                                        onClick={() => void handleDisconnectWallet()}
                                      >
                                        Disconnect
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="space-y-1">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={isWalletConnecting}
                                        onClick={() => void handleConnectWallet()}
                                      >
                                        {isWalletConnecting ? "Connecting…" : "Connect wallet to top up"}
                                      </Button>
                                      {walletConnectError && (
                                        <p className="text-[11px] text-red-500 dark:text-red-400">
                                          {walletConnectError}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    Sends {formatEth(quote?.topUpEth ?? "0")} ETH to the managed wallet for gas.
                                  </p>
                                </div>
                              )}
                            </div>
                            {withdrawErrors[summary.transferId] && (
                              <p className="text-[11px] text-red-500 dark:text-red-400">
                                {withdrawErrors[summary.transferId]}
                              </p>
                            )}
                            {topUpErrors[summary.transferId] && (
                              <p className="text-[11px] text-red-500 dark:text-red-400">
                                {topUpErrors[summary.transferId]}
                              </p>
                            )}
                            {topUpSuccess[summary.transferId] && (
                              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                                Gas top-up sent ·{" "}
                                <a
                                  href={`https://basescan.org/tx/${topUpSuccess[summary.transferId]}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline"
                                >
                                  View on Basescan
                                </a>
                              </p>
                            )}
                            {withdrawSuccess[summary.transferId] && (
                              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                                Withdrawal submitted ·{" "}
                                <a
                                  href={`https://basescan.org/tx/${withdrawSuccess[summary.transferId]}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline"
                                >
                                  View on Basescan
                                </a>
                              </p>
                            )}
                          </form>
                        ) : summary.status === "WITHDRAWN" ? (
                          <div className="mt-3 text-[11px] text-emerald-600 dark:text-emerald-400">
                            Withdrawn to {summary.withdrawalTargetAddress ?? "recipient wallet"}
                            {summary.withdrawalTxHash && (
                              <>
                                {" "}·{" "}
                                <a
                                  href={`https://basescan.org/tx/${summary.withdrawalTxHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline"
                                >
                                  View on Basescan
                                </a>
                              </>
                            )}
                            {summary.withdrawnAt && (
                              <span className="text-slate-400 dark:text-slate-500">
                                {" "}({new Date(summary.withdrawnAt).toLocaleString()})
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
                            Transfer is still processing. We’ll surface the claim action once the deposit is
                            confirmed on-chain.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {transferError && transferSummaries.length > 0 && (
                <p className="text-xs text-red-500 dark:text-red-400">{transferError}</p>
              )}
            </div>
          </article>
        </div>
      </section>
    </>
  );
}
