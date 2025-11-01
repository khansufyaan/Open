"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useTurnkey } from "@turnkey/sdk-react";
import type { Session } from "@turnkey/sdk-types";
import { CheckCircle2, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PlaidConnectButton } from "@/components/plaid-connect-button";
import { SendMoneyModal } from "@/components/send-money-modal";
import { ReceiverFlowModal } from "@/components/receiver-flow-modal";
import type { PlaidAchAccount, PlaidIdentitySnapshot, TransferSummary } from "@/types/receiver";
import { base } from "viem/chains";

const TURNKEY_READY = Boolean(
  process.env.NEXT_PUBLIC_TURNKEY_API_BASE_URL && process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID
);

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

const PLAID_STORAGE_PREFIX = "bluewallet:plaid:v1";

type StoredPlaidSnapshot = {
  identity: PlaidIdentitySnapshot;
  selectedAccountKey?: string;
  updatedAt: string;
};

function getPlaidStorageKey(userId: string): string {
  return `${PLAID_STORAGE_PREFIX}:${userId}`;
}

function loadStoredPlaidSnapshot(userId: string): StoredPlaidSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getPlaidStorageKey(userId));

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredPlaidSnapshot> | null;

    if (!parsed || typeof parsed !== "object" || !parsed.identity) {
      return null;
    }

    const identity = parsed.identity as Partial<PlaidIdentitySnapshot>;

    const normalizedIdentity: PlaidIdentitySnapshot = {
      names: Array.isArray(identity.names) ? identity.names : [],
      emails: Array.isArray(identity.emails) ? identity.emails : [],
      phones: Array.isArray(identity.phones) ? identity.phones : [],
      addresses: Array.isArray(identity.addresses) ? identity.addresses : [],
      achAccounts: Array.isArray(identity.achAccounts) ? identity.achAccounts : [],
    };

    return {
      identity: normalizedIdentity,
      selectedAccountKey:
        typeof parsed.selectedAccountKey === "string" ? parsed.selectedAccountKey : undefined,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch (error) {
    console.warn("[Plaid Storage] Failed to load persisted Plaid data", error);
    return null;
  }
}

function saveStoredPlaidSnapshot(userId: string, snapshot: StoredPlaidSnapshot): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getPlaidStorageKey(userId), JSON.stringify(snapshot));
  } catch (error) {
    console.warn("[Plaid Storage] Failed to persist Plaid data", error);
  }
}

export function AuthFlow() {
  if (!TURNKEY_READY) {
    return (
      <section className="rounded-3xl border border-slate-200/80 bg-white/70 p-8 text-slate-600 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-300">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Setup required
        </h2>
        <p className="mt-4 max-w-xl text-lg leading-7">
          Set `NEXT_PUBLIC_TURNKEY_API_BASE_URL` and `NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID` in your
          `.env.local` file to enable the login experience.
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
  const indexedDbClient = turnkeyContext.indexedDbClient;
  const ALL_ACCOUNTS_KEY = "__ALL__";
  const [authError, setAuthError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [showFlowModal, setShowFlowModal] = useState(false);

  // OTP login state
  const [email, setEmail] = useState("");
  const [otpId, setOtpId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [step, setStep] = useState<"request" | "verify">("request");
  const [subOrgId, setSubOrgId] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
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
  const [userWalletInfo, setUserWalletInfo] = useState<{
    walletId?: string;
    walletAddress?: string;
  } | null>(null);
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
    let preferredSelectedKey = ALL_ACCOUNTS_KEY;

    const attemptLocalHydration = () => {
      const stored = loadStoredPlaidSnapshot(session.userId);

      if (!stored) {
        return;
      }

      const normalizedAccounts = normalizeAchAccounts(stored.identity.achAccounts);

      if (normalizedAccounts.length === 0) {
        console.log("[Plaid Hydration] Stored Plaid snapshot had no valid accounts");
        return;
      }

      const mergedAccounts = mergeAchAccounts([], normalizedAccounts);

      const candidateSelectedKey =
        stored.selectedAccountKey &&
        (stored.selectedAccountKey === ALL_ACCOUNTS_KEY ||
          mergedAccounts.some((account) => getAccountKey(account) === stored.selectedAccountKey))
          ? stored.selectedAccountKey
          : ALL_ACCOUNTS_KEY;

      preferredSelectedKey = candidateSelectedKey;

      if (cancelled) {
        return;
      }

      console.log("[Plaid Hydration] Applied Plaid data from local storage");
      setPlaidIdentity({
        ...stored.identity,
        achAccounts: mergedAccounts,
      });
      setLinkedAccounts(mergedAccounts);
      setSelectedAccountKey(candidateSelectedKey);
    };

    attemptLocalHydration();

    const hydratePlaidData = async () => {
      console.log("[Plaid Hydration] Starting for userId:", session.userId);
      let shouldMarkHydrated = true;

      try {
        const response = await fetch(`/api/db/user?userId=${encodeURIComponent(session.userId)}`);

        console.log("[Plaid Hydration] Response status:", response.status);

        if (!response.ok) {
          if (response.status === 404) {
            console.log("[Plaid Hydration] User not found (404) - will retry on next attempt");
            shouldMarkHydrated = false;
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

        const candidateSelectedKey =
          preferredSelectedKey === ALL_ACCOUNTS_KEY ||
          mergedAccounts.some((account) => getAccountKey(account) === preferredSelectedKey)
            ? preferredSelectedKey
            : ALL_ACCOUNTS_KEY;

        preferredSelectedKey = candidateSelectedKey;

        console.log("[Plaid Hydration] Successfully hydrated Plaid data from API, setting state");
        setPlaidIdentity(fallbackIdentity);
        setLinkedAccounts(mergedAccounts);
        setSelectedAccountKey(candidateSelectedKey);
      } catch (error) {
        console.error("[Plaid Hydration] Failed to hydrate Plaid verification:", error);
      } finally {
        if (!cancelled && shouldMarkHydrated) {
          console.log("[Plaid Hydration] Setting plaidHydrated to true");
          setPlaidHydrated(true);
        } else if (!cancelled && !shouldMarkHydrated) {
          console.log("[Plaid Hydration] Skipping plaidHydrated flag to allow retry");
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

  useEffect(() => {
    if (!session?.userId || !plaidIdentity) {
      return;
    }

    const normalizedAccounts = normalizeAchAccounts(linkedAccounts);

    if (normalizedAccounts.length === 0) {
      return;
    }

    const persistedSelectedKey =
      selectedAccountKey === ALL_ACCOUNTS_KEY ||
      normalizedAccounts.some((account) => getAccountKey(account) === selectedAccountKey)
        ? selectedAccountKey
        : ALL_ACCOUNTS_KEY;

    saveStoredPlaidSnapshot(session.userId, {
      identity: {
        ...plaidIdentity,
        achAccounts: normalizedAccounts,
      },
      selectedAccountKey: persistedSelectedKey,
      updatedAt: new Date().toISOString(),
    });
  }, [session?.userId, plaidIdentity, linkedAccounts, selectedAccountKey, ALL_ACCOUNTS_KEY]);

  const handleAuthSuccess = async (email: string) => {
    if (!turnkey) {
      setAuthError("Authentication client is not ready. Check your configuration and try again.");
      return;
    }

    try {
      const activeSession = await turnkey.getSession();

      if (!activeSession) {
        setAuthError("Authentication succeeded, but no active session was returned.");
        setSession(null);
        return;
      }

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

        if (!data.success) {
          console.error("[Auth] Failed to create user record:", data);
          setAuthError("Failed to create user record. Please try again.");
          return;
        }
      } catch (dbError) {
        console.error("[Auth] Failed to store initial user data:", dbError);
        setAuthError("Failed to create user record. Please try again.");
        return;
      }

      // Only set session AFTER user record is created in database
      console.log("[Auth] User record created, setting session for userId:", activeSession.userId);
      setSession(activeSession);
      setAuthError(null);
      setPlaidHydrated(false); // Trigger hydration now that user exists in DB
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to fetch the active session.";
      setAuthError(message);
    }
  };

  const handleAuthError = (message: string) => {
    setAuthError(message || "Something went wrong while signing in.");
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setAuthError("Please enter a valid email address.");
      return;
    }

    setIsRequesting(true);
    setAuthError(null);
    try {
      console.log(`[Auth] Creating/verifying Turnkey user for: ${trimmedEmail}`);

      const ensureUserResponse = await fetch("/api/turnkey/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: trimmedEmail }),
      });

      if (!ensureUserResponse.ok) {
        const data = (await ensureUserResponse.json().catch(() => null)) as
          | { message?: string; error?: string; details?: unknown }
          | null;

        console.error("[Auth] Failed to create/verify user:", data);

        const errorMessage = data?.message ?? data?.error ?? "Unable to prepare user account.";
        throw new Error(errorMessage);
      }

      const userData = await ensureUserResponse.json() as {
        created: boolean;
        subOrganizationId?: string;
        subOrgExists?: boolean;
      };
      console.log(`[Auth] User registration result:`, userData);

      const userSubOrgId = userData.subOrganizationId;
      console.log(`[Auth] Sub-organization ID: ${userSubOrgId ?? 'not returned'}`);

      if (!userSubOrgId) {
        throw new Error("Sub-organization ID not returned - cannot proceed with OTP login");
      }

      setSubOrgId(userSubOrgId);

      if (!turnkey) {
        throw new Error("Authentication client not available");
      }

      console.log(`[Auth] Initiating email OTP for: ${trimmedEmail}`);
      console.log(`[Auth] Using PARENT org ID for initOtp: ${process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID}`);

      const response = await turnkey.serverSign("initOtp", [{
        otpType: "OTP_TYPE_EMAIL",
        contact: trimmedEmail,
        organizationId: process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID!,
        otpLength: 6,
        alphanumeric: false,
        expirationSeconds: "300",
      }]) as { otpId: string };

      console.log(`[Auth] OTP initiated successfully with ID: ${response.otpId}`);

      setOtpId(response.otpId);
      setStep("verify");
    } catch (error) {
      console.error("[Auth] Email auth flow failed:", error);
      const message = error instanceof Error ? error.message : "Failed to send email OTP";
      setAuthError(message);
    } finally {
      setIsRequesting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim() || !otpId) {
      setAuthError("Please enter the verification code");
      return;
    }

    setIsVerifying(true);
    setAuthError(null);

    try {
      if (!turnkey || !indexedDbClient) {
        throw new Error("Authentication clients not available");
      }

      console.log(`[Auth] Verifying OTP code with parent org ID`);
      const verifyResponse = await turnkey.serverSign("verifyOtp", [{
        otpId: otpId,
        otpCode: otpCode.trim(),
        organizationId: process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID!
      }]) as { verificationToken: string };

      console.log(`[Auth] OTP verified successfully`);

      console.log(`[Auth] Clearing IndexedDB to generate fresh credential`);
      await indexedDbClient.clear();

      await indexedDbClient.init();
      const publicKey = await indexedDbClient.getPublicKey();

      if (!subOrgId) {
        throw new Error("Sub-organization ID not available - cannot complete login");
      }

      console.log(`[Auth] Logging in with SUB-ORG ID: ${subOrgId}`);
      const loginResponse = await turnkey.serverSign("otpLogin", [{
        publicKey: publicKey,
        verificationToken: verifyResponse.verificationToken,
        organizationId: subOrgId,
        expirationSeconds: "900"
      }]) as { session?: string };

      const sessionToken = loginResponse?.session;

      if (!sessionToken) {
        throw new Error("Authentication service did not return a session token.");
      }

      await indexedDbClient.loginWithSession(sessionToken);

      await handleAuthSuccess(email.trim());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Verification failed";
      setAuthError(message);
    } finally {
      setIsVerifying(false);
    }
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
      // Reset OTP state
      setEmail("");
      setOtpId(null);
      setOtpCode("");
      setStep("request");
      setSubOrgId(null);
      setIsRequesting(false);
      setIsVerifying(false);
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

    const nextIdentity: PlaidIdentitySnapshot = {
      ...identityData,
      achAccounts: mergedAccounts,
    };

    setLinkedAccounts(mergedAccounts);
    setSelectedAccountKey(nextSelectedKey);
    setPlaidIdentity(nextIdentity);
    setAuthError(null);

    if (session) {
      const snapshotTimestamp = new Date().toISOString();

      saveStoredPlaidSnapshot(session.userId, {
        identity: nextIdentity,
        selectedAccountKey: nextSelectedKey,
        updatedAt: snapshotTimestamp,
      });

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
            plaidLastLinkedAt: snapshotTimestamp,
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

  // Simplified send handler for SendMoneyModal
  const handleSendMoney = useCallback(
    async (transferId: string, destination: string, _amount: string) => {
      // Note: amount parameter is ignored - the API withdraws the full transfer amount
      setWithdrawLoading((previous) => ({
        ...previous,
        [transferId]: true,
      }));
      setWithdrawErrors((previous) => ({
        ...previous,
        [transferId]: null,
      }));
      setWithdrawSuccess((previous) => ({
        ...previous,
        [transferId]: null,
      }));

      try {
        const response = await fetch(`/api/transfers/${transferId}/withdraw`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            targetAddress: destination,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message ?? data.error ?? "Withdrawal failed.");
        }

        setWithdrawSuccess((previous) => ({
          ...previous,
          [transferId]: data.txHash as string,
        }));

        // Refresh transfers
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
          [transferId]:
            error instanceof Error ? error.message : "Failed to send transaction. Please try again.",
        }));
        throw error; // Re-throw so modal can handle it
      } finally {
        setWithdrawLoading((previous) => ({
          ...previous,
          [transferId]: false,
        }));
      }
    },
    [ALL_ACCOUNTS_KEY, fetchTransfersForAccounts, linkedAccounts, selectedAccountKey]
  );

  // Auto-open flow modal when logged in
  useEffect(() => {
    if (session) {
      setShowFlowModal(true);
    }
  }, [session]);

  if (!session) {
    return (
      <section className="max-w-md mx-auto rounded-2xl border border-slate-200/80 bg-white/70 p-6 text-slate-700 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200">
        <Card className="border-0 shadow-none bg-transparent">
          {step === "request" ? (
            <>
              <CardHeader className="space-y-3 text-center pb-3">
                <div className="flex justify-center">
                  <div className="h-12 w-12 rounded-xl bg-blue-600 flex items-center justify-center">
                    <span className="text-xl font-bold text-white">B</span>
                  </div>
                </div>
                <div>
                  <CardTitle className="text-lg font-bold">Blue Wallets</CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-1">
                    Receive USDC Instantly
                  </CardDescription>
                </div>
                <div className="pt-1">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    Sign in with your email
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    We&apos;ll send you a code to verify your identity
                  </p>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {authError && (
                  <p className="mb-3 text-xs text-red-600 dark:text-red-400 text-center">{authError}</p>
                )}
                <form onSubmit={handleEmailAuth} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Email Address
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="h-9 text-sm"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={isRequesting || !email.trim()}
                    className="w-full h-9 text-sm font-semibold bg-blue-600 hover:bg-blue-700"
                  >
                    {isRequesting ? "Sending code..." : "Send Verification Code"}
                  </Button>
                </form>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="space-y-3 text-center pb-3">
                <div className="flex justify-center">
                  <div className="h-12 w-12 rounded-xl bg-blue-600 flex items-center justify-center">
                    <span className="text-xl font-bold text-white">B</span>
                  </div>
                </div>
                <div>
                  <CardTitle className="text-lg font-bold">Blue Wallets</CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-1">
                    Receive USDC Instantly
                  </CardDescription>
                </div>
                <div className="pt-1">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    Enter verification code
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Enter the 6-digit code sent to {email}
                  </p>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {authError && (
                  <p className="mb-3 text-xs text-red-600 dark:text-red-400 text-center">{authError}</p>
                )}
                <form onSubmit={handleVerifyOtp} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="otp" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Verification Code
                    </Label>
                    <Input
                      id="otp"
                      inputMode="text"
                      autoComplete="one-time-code"
                      placeholder="123456"
                      value={otpCode}
                      onChange={(e) => {
                        const cleaned = e.target.value
                          .toUpperCase()
                          .replace(/[^A-Z0-9]/g, "")
                          .slice(0, 6);
                        setOtpCode(cleaned);
                      }}
                      maxLength={6}
                      required
                      className="h-9 text-sm text-center text-lg tracking-widest"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      type="submit"
                      disabled={isVerifying || otpCode.length !== 6}
                      className="w-full h-9 text-sm font-semibold bg-blue-600 hover:bg-blue-700"
                    >
                      {isVerifying ? "Verifying..." : "Verify and Sign In"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setStep("request");
                        setOtpCode("");
                        setOtpId(null);
                        setAuthError(null);
                      }}
                      disabled={isVerifying}
                      className="h-7 text-xs"
                    >
                      Resend code
                    </Button>
                  </div>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </section>
    );
  }

  return (
    <>
      <section className="space-y-6 rounded-3xl border border-slate-200/80 bg-white/70 p-10 text-center text-slate-700 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200">
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="flex justify-center">
            <div className="h-20 w-20 rounded-2xl bg-blue-600 flex items-center justify-center">
              <span className="text-4xl font-bold text-white">B</span>
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Welcome Back
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-300">
              You&apos;re signed in. Manage your bank account and transfers.
            </p>
          </div>

          {authError && (
            <p className="text-sm text-red-600 dark:text-red-400">{authError}</p>
          )}

          <div className="flex flex-col items-center gap-3 pt-4">
            <Button
              size="lg"
              onClick={() => setShowFlowModal(true)}
              className="min-w-[240px] h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700"
            >
              Manage Transfers
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-slate-500"
            >
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
      </section>

      <ReceiverFlowModal
        open={showFlowModal}
        onOpenChange={setShowFlowModal}
        session={session}
        plaidIdentity={plaidIdentity}
        transferSummaries={transferSummaries}
        isTransfersLoading={isTransfersLoading}
        userWalletInfo={userWalletInfo}
        onPlaidSuccess={handlePlaidSuccess}
        onPlaidError={handlePlaidError}
        onClaim={handleClaim}
        onWithdraw={handleWithdraw}
        claimLoading={claimLoading}
        claimErrors={claimErrors}
        claimSuccess={claimSuccess}
        linkedAccounts={linkedAccounts}
        selectedAccount={selectedAccount}
      />

      <section
        ref={stepsRef}
        className="hidden space-y-4 rounded-3xl border border-slate-200/80 bg-white/70 p-6 text-slate-700 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200"
      >
        {/* Identity Verified Widget */}
        <article className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Identity Verified</h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  You&apos;re signed in securely.
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

        {/* Link Bank Account Widget */}
        {(
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

        {/* Claim Funds Widget */}
        {transferSummaries.filter(s => s.status === "DEPOSITED").length > 0 && (
          <article className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Claim Funds</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Claim your transfers to move funds from the company vault into your managed wallet.
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

        {/* Withdraw Widget */}
        {transferSummaries.filter(s => s.status === "CLAIMED").length > 0 && (
          <article className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Withdraw to External Wallet</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Transfer your claimed funds from your managed wallet to any external Base wallet address.
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
                <ul className="space-y-4">
                  {transferSummaries.filter(s => s.status === "CLAIMED").map((summary) => {
                    return (
                      <li
                        key={summary.transferId}
                        className="rounded-lg border border-slate-200/70 p-3 dark:border-slate-700/50"
                      >
                        {!withdrawSuccess[summary.transferId] ? (
                          <SendMoneyModal
                            transferId={summary.transferId}
                            walletAddress={summary.walletAddress ?? ""}
                            usdcBalance={summary.amount}
                            onSend={async (destination, amount) => {
                              await handleSendMoney(summary.transferId, destination, amount);
                            }}
                            isLoading={withdrawLoading[summary.transferId]}
                          />
                        ) : (
                          <div className="rounded-lg bg-emerald-50 p-4 dark:bg-emerald-900/20">
                            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                              ✓ Transfer Complete
                            </p>
                            <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                              {summary.amount} USDC sent successfully
                            </p>
                            <a
                              href={`https://basescan.org/tx/${withdrawSuccess[summary.transferId]}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 inline-block text-xs text-emerald-600 hover:underline dark:text-emerald-400"
                            >
                              View on Basescan →
                            </a>
                          </div>
                        )}

                        {withdrawErrors[summary.transferId] && (
                          <div className="mt-3 rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
                            <p className="text-sm text-red-600 dark:text-red-400">
                              {withdrawErrors[summary.transferId]}
                            </p>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </article>
        )}

        {/* Past Transfers Widget */}
        {transferSummaries.filter(s => s.status === "WITHDRAWN").length > 0 && (
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

      </section>
    </>
  );
}
