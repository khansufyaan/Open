"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useTurnkey } from "@turnkey/sdk-react";
import type { Session } from "@turnkey/sdk-types";
import { CheckCircle2, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Stepper } from "@/components/ui/stepper";
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
  claimTxHash?: string | null;
  claimedAt?: string | null;
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
  const [claimLoading, setClaimLoading] = useState<Record<string, boolean>>({});
  const [claimErrors, setClaimErrors] = useState<Record<string, string | null>>({});
  const [claimSuccess, setClaimSuccess] = useState<Record<string, string | null>>({});
  const [currentStep, setCurrentStep] = useState(0);
  const [userWalletInfo, setUserWalletInfo] = useState<{
    walletId?: string;
    walletAddress?: string;
  } | null>(null);

  const steps = [
    { id: "verify", title: "Verify Identity", description: "Sign in with Turnkey" },
    { id: "bank", title: "Link Bank", description: "Connect your bank account" },
    { id: "claim", title: "Claim Funds", description: "Move to your wallet" },
    { id: "withdraw", title: "Withdraw", description: "Send to external wallet" },
  ];
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
      console.log("[Plaid Hydration] Skipped:", { hasSession: !!session, plaidHydrated });
      return;
    }

    let cancelled = false;

    const hydratePlaidData = async () => {
      console.log("[Plaid Hydration] Starting for userId:", session.userId);
      try {
        const response = await fetch(`/api/db/user?userId=${encodeURIComponent(session.userId)}`);

        console.log("[Plaid Hydration] Response status:", response.status);

        if (!response.ok) {
          if (response.status === 404) {
            console.log("[Plaid Hydration] User not found (404) - will retry on next attempt");
            // Don't set plaidHydrated to true, so we can retry later
            return;
          }
          console.log("[Plaid Hydration] Response not OK");
          return;
        }

        const data = await response.json();
        const user = data.user as Record<string, unknown>;

        console.log("[Plaid Hydration] User data:", {
          plaidVerificationCompleted: user?.plaidVerificationCompleted,
          plaidAchAccountsIsArray: Array.isArray(user?.plaidAchAccounts),
          plaidAchAccountsCount: Array.isArray(user?.plaidAchAccounts) ? user.plaidAchAccounts.length : 0,
          plaidVerifiedName: user?.plaidVerifiedName,
          plaidVerifiedEmail: user?.plaidVerifiedEmail,
          walletId: user?.walletId,
          walletAddress: user?.walletAddress,
          allKeys: Object.keys(user || {}),
        });

        // Extract wallet info if available
        if (user?.walletId || user?.walletAddress) {
          console.log("[Plaid Hydration] Found wallet info for user");
          setUserWalletInfo({
            walletId: user.walletId as string | undefined,
            walletAddress: user.walletAddress as string | undefined,
          });
        }

        const verificationCompleted = Boolean(user?.plaidVerificationCompleted);
        const storedAccountsRaw = Array.isArray(user?.plaidAchAccounts)
          ? (user.plaidAchAccounts as PlaidAchAccount[])
          : [];

        console.log("[Plaid Hydration] Verification check:", {
          verificationCompleted,
          storedAccountsCount: storedAccountsRaw.length,
        });

        if (!verificationCompleted || storedAccountsRaw.length === 0) {
          console.log("[Plaid Hydration] No saved Plaid data found - missing requirements");
          return;
        }

        const normalizedAccounts = normalizeAchAccounts(storedAccountsRaw);

        if (normalizedAccounts.length === 0) {
          console.log("[Plaid Hydration] No accounts after normalization");
          return;
        }

        console.log("[Plaid Hydration] Normalized accounts:", normalizedAccounts.length);

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
          console.log("[Plaid Hydration] Cancelled before setting state");
          return;
        }

        console.log("[Plaid Hydration] Successfully hydrated Plaid data, setting state");
        setPlaidIdentity(fallbackIdentity);
        setLinkedAccounts(mergedAccounts);
        setSelectedAccountKey(ALL_ACCOUNTS_KEY);
      } catch (error) {
        console.error("[Plaid Hydration] Failed to hydrate Plaid verification:", error);
      } finally {
        if (!cancelled) {
          console.log("[Plaid Hydration] Setting plaidHydrated to true");
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

      console.log("[Auth] Setting session for userId:", activeSession.userId);
      setSession(activeSession);
      setAuthError(null);
      setCurrentStep(1); // Move to Step 2: Link Bank after successful login

      console.log("[Auth] Creating initial user record in database");
      try {
        const response = await fetch("/api/db/user", {
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
        console.log("[Auth] Initial user record response status:", response.status);
        const data = await response.json();
        console.log("[Auth] Initial user record response:", data.success ? "Success" : "Failed", data);

        if (data.success) {
          // Reset plaidHydrated to trigger hydration after user record is created
          console.log("[Auth] Resetting plaidHydrated to allow hydration retry");
          setPlaidHydrated(false);
        }
      } catch (dbError) {
        console.error("[Auth] Failed to store initial user data:", dbError);
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
    console.log("[Plaid Save] Starting Plaid success handler");
    const normalizedAccounts = normalizeAchAccounts(identityData.achAccounts);
    const mergedAccounts = mergeAchAccounts(linkedAccounts, normalizedAccounts);

    console.log("[Plaid Save] Merged accounts count:", mergedAccounts.length);

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
      console.log("[Plaid Save] Saving to database for userId:", session.userId);
      try {
        const response = await fetch("/api/db/user", {
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
        console.log("[Plaid Save] Database save response status:", response.status);
        const data = await response.json();
        console.log("[Plaid Save] Database save response:", data.success ? "Success" : "Failed");

        if (data.success) {
          console.log("[Plaid Save] Plaid data saved successfully - will be loaded on next login");
        }
      } catch (dbError) {
        console.error("[Plaid Save] Failed to store Plaid data:", dbError);
      }
    } else {
      console.log("[Plaid Save] No session found, cannot save to database");
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

  const handleClaim = useCallback(
    async (summary: TransferSummary) => {
      setClaimErrors((previous) => ({
        ...previous,
        [summary.transferId]: null,
      }));
      setClaimSuccess((previous) => ({
        ...previous,
        [summary.transferId]: null,
      }));
      setClaimLoading((previous) => ({
        ...previous,
        [summary.transferId]: true,
      }));

      try {
        const response = await fetch(`/api/transfers/${summary.transferId}/claim`, {
          method: "POST",
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message ?? "Failed to claim transfer.");
        }

        const txHash = typeof data.txHash === "string" ? data.txHash : null;

        setClaimSuccess((previous) => ({
          ...previous,
          [summary.transferId]: txHash,
        }));

        setTransferSummaries((previous) =>
          previous.map((entry) =>
            entry.transferId === summary.transferId
              ? {
                  ...entry,
                  status: "CLAIMED",
                  claimTxHash: txHash,
                  claimedAt: new Date().toISOString(),
                  walletAddress: entry.recipientWalletAddress ?? entry.walletAddress ?? null,
                }
              : entry
          )
        );

        if (linkedAccounts.length > 0) {
          await fetchTransfersForAccounts(linkedAccounts);
        }
      } catch (error) {
        console.error("Claim transfer failed", error);
        setClaimErrors((previous) => ({
          ...previous,
          [summary.transferId]:
            error instanceof Error ? error.message : "Failed to claim transfer. Please retry.",
        }));
      } finally {
        setClaimLoading((previous) => ({
          ...previous,
          [summary.transferId]: false,
        }));
      }
    },
    [fetchTransfersForAccounts, linkedAccounts]
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
        <section className="space-y-6 rounded-3xl border border-slate-200/80 bg-white/70 p-10 text-slate-700 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200">
          <div className="space-y-4">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Receive
            </h1>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              Complete the steps below to link your bank account and manage transfers.
            </p>
          </div>

          <Stepper steps={steps} currentStep={0} />

          {authError && (
            <p className="text-sm text-red-600 dark:text-red-400">{authError}</p>
          )}
        </section>

        <section
          ref={stepsRef}
          className="space-y-4 rounded-3xl border border-slate-200/80 bg-white/70 p-6 text-slate-700 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200"
        >
          <article className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Verify Identity</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Sign in with email OTP and let Turnkey establish a short-lived session for secure actions.
            </p>
            <Button className="mt-4 w-full sm:w-auto" onClick={() => setShowAuthModal(true)}>
              Sign in with Turnkey
            </Button>
          </article>
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
      <section className="space-y-6 rounded-3xl border border-slate-200/80 bg-white/70 p-10 text-slate-700 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Receive
            </h1>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </div>
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            Complete the steps below to link your bank account and manage transfers.
          </p>
        </div>

        <Stepper steps={steps} currentStep={currentStep} />

        {authError && (
          <p className="text-sm text-red-600 dark:text-red-400">{authError}</p>
        )}
      </section>

      <section
        ref={stepsRef}
        className="space-y-4 rounded-3xl border border-slate-200/80 bg-white/70 p-6 text-slate-700 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200"
      >
        {/* Step 0: Identity Verified */}
        {currentStep === 0 && (
          <article className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Identity Verified</h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    You're signed in with Turnkey.
                  </p>
                </div>
              </div>

              {/* User Information */}
              <div className="rounded-lg border border-slate-200/70 bg-white/50 p-3 space-y-3 dark:border-slate-700/50 dark:bg-slate-800/50">
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">User ID</p>
                  <p className="text-sm font-mono text-slate-900 dark:text-white break-all">
                    {session.userId}
                  </p>
                </div>

                {(userWalletInfo?.walletAddress || transferSummaries.length > 0) && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Wallet Address</p>
                    <p className="text-sm font-mono text-slate-900 dark:text-white break-all">
                      {userWalletInfo?.walletAddress || transferSummaries[0]?.walletAddress || "Not provisioned yet"}
                    </p>
                    {(userWalletInfo?.walletAddress || transferSummaries[0]?.walletAddress) && (
                      <a
                        href={`https://basescan.org/address/${userWalletInfo?.walletAddress || transferSummaries[0]?.walletAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-sky-500 hover:underline"
                      >
                        View on Basescan
                      </a>
                    )}
                  </div>
                )}

                {(userWalletInfo?.walletId || transferSummaries.length > 0) && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Wallet ID</p>
                    <p className="text-sm font-mono text-slate-900 dark:text-white break-all">
                      {userWalletInfo?.walletId || transferSummaries[0]?.walletId || "Not assigned yet"}
                    </p>
                  </div>
                )}

                {plaidIdentity && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Bank Account Status</p>
                    <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Verified and saved
                    </p>
                  </div>
                )}
              </div>
            </div>
          </article>
        )}

        {/* Step 1: Link Bank Account */}
        {currentStep === 1 && (
          <article className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Link Bank Account</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Connect your bank account to verify your identity. Plaid securely retrieves your personal information
              from your bank for compliance verification.
            </p>
            {plaidIdentity ? (
              <div className="mt-3 space-y-4 text-sm">
                <div className="flex items-center gap-2 font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" /> Bank Account Verified
                </div>

                {/* Personal Information */}
                <div className="rounded-lg border border-slate-200/70 bg-white/50 p-4 space-y-3 dark:border-slate-700/50 dark:bg-slate-800/50">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Personal Information
                  </h4>

                  <div className="space-y-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Full Name</p>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {plaidIdentity.names[0] ?? "Not provided"}
                      </p>
                    </div>

                    {plaidIdentity.emails[0] && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Email Address</p>
                        <p className="text-sm text-slate-900 dark:text-white">
                          {plaidIdentity.emails[0]}
                        </p>
                      </div>
                    )}

                    {plaidIdentity.phones[0] && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Phone Number</p>
                        <p className="text-sm text-slate-900 dark:text-white">
                          {plaidIdentity.phones[0]}
                        </p>
                      </div>
                    )}

                    {plaidIdentity.addresses[0] && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Address</p>
                        <p className="text-sm text-slate-900 dark:text-white">
                          {plaidIdentity.addresses[0].street}
                        </p>
                        <p className="text-sm text-slate-900 dark:text-white">
                          {plaidIdentity.addresses[0].city}, {plaidIdentity.addresses[0].region} {plaidIdentity.addresses[0].postal_code}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bank Account Details */}
                {selectedAccount && (
                  <div className="rounded-lg border border-slate-200/70 bg-white/50 p-4 space-y-3 dark:border-slate-700/50 dark:bg-slate-800/50">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Bank Account Details
                    </h4>

                    <div className="space-y-2">
                      {selectedAccount.name && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Account Name</p>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">
                            {selectedAccount.name}
                          </p>
                        </div>
                      )}

                      <div>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Routing Number</p>
                        <p className="text-sm font-mono text-slate-900 dark:text-white">
                          {selectedAccount.routingNumber}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Account Number</p>
                        <p className="text-sm font-mono text-slate-900 dark:text-white">
                          {selectedAccount.accountNumber}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Multiple Account Selector */}
                {linkedAccounts.length > 1 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Select Account to View
                    </h4>
                    <div className="space-y-2">
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
                          All Linked Accounts
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          View combined deposits
                        </p>
                      </button>
                      {linkedAccounts.map((account) => {
                        const key = getAccountKey(account);
                        const isSelected = selectedAccountKey === key;
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

                <div className="pt-2">
                  <PlaidConnectButton
                    userId={session.userId}
                    label={linkedAccounts.length > 0 ? "Link Another Bank Account" : "Connect Bank Account"}
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
        )}

        {/* Step 2: Claim Funds */}
        {currentStep === 2 && (
          <article className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Claim Funds</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Claim your transfers to move funds from the company vault into your managed Turnkey wallet.
            </p>
            <div className="mt-3 space-y-3">
              {isTransfersLoading ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">Loading deposits…</p>
              ) : transferSummaries.filter(s => s.status === "DEPOSITED").length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {transferSummaries.length === 0
                    ? (transferError ?? "No deposits found for the connected bank account yet.")
                    : "No deposits available to claim. Check the Withdraw step for claimed transfers."}
                </p>
              ) : (
                <ul className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
                  {transferSummaries.filter(s => s.status === "DEPOSITED").map((summary) => {
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
                        <div className="mt-3 space-y-2">
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Claim this transfer to move funds from the company vault into your managed wallet.
                          </p>
                          {claimErrors[summary.transferId] && (
                            <p className="text-[11px] text-red-500 dark:text-red-400">
                              {claimErrors[summary.transferId]}
                            </p>
                          )}
                          {claimSuccess[summary.transferId] && (
                            <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                              Claimed on-chain ·{" "}
                              <a
                                href={`https://basescan.org/tx/${claimSuccess[summary.transferId]}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline"
                              >
                                View transaction
                              </a>
                            </p>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            disabled={Boolean(claimLoading[summary.transferId])}
                            onClick={() => void handleClaim(summary)}
                          >
                            {claimLoading[summary.transferId] ? "Claiming…" : "Claim funds"}
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </article>
        )}

        {/* Step 3: Withdraw */}
        {currentStep === 3 && (
          <article className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Withdraw to External Wallet</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Transfer your claimed funds from your Turnkey managed wallet to any external Base wallet address.
            </p>
            <div className="mt-3 space-y-3">
              {isTransfersLoading ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">Loading transfers…</p>
              ) : transferSummaries.filter(s => s.status === "CLAIMED").length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {transferSummaries.length === 0
                    ? (transferError ?? "No deposits found for the connected bank account yet.")
                    : "No claimed transfers available to withdraw. Go back to the Claim Funds step to claim your deposits first."}
                </p>
              ) : (
                <ul className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
                  {transferSummaries.filter(s => s.status === "CLAIMED").map((summary) => {
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
                        <form
                          className="mt-3 space-y-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void handleWithdraw(summary);
                          }}
                        >
                          <div className="space-y-1.5">
                            {summary.claimTxHash && (
                              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                                Claimed ·{" "}
                                <a
                                  href={`https://basescan.org/tx/${summary.claimTxHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline"
                                >
                                  View claim tx
                                </a>
                              </p>
                            )}
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
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </article>
        )}

        {/* Past Transfers Section - shown on any step after claiming */}
        {currentStep >= 2 && transferSummaries.filter(s => s.status === "WITHDRAWN").length > 0 && (
          <article className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <h4 className="text-lg font-semibold text-slate-900 dark:text-white">Past Transfers</h4>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Completed withdrawals to external wallets.
            </p>
            <div className="mt-3">
              <ul className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
                {transferSummaries.filter(s => s.status === "WITHDRAWN").map((summary) => (
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
                  </li>
                ))}
              </ul>
            </div>
          </article>
        )}

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between pt-4">
          <Button
            variant="outline"
            onClick={() => setCurrentStep((prev) => Math.max(0, prev - 1))}
            disabled={currentStep === 0}
          >
            Back
          </Button>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Step {currentStep + 1} of {steps.length}
          </div>
          <Button
            onClick={() => setCurrentStep((prev) => Math.min(steps.length - 1, prev + 1))}
            disabled={currentStep === steps.length - 1}
          >
            Next
          </Button>
        </div>
      </section>
    </>
  );
}
