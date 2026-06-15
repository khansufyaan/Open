"use client";

import { useCallback, useEffect, useState } from "react";

import { usePrivy } from "@privy-io/react-auth";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PlaidConnectButton } from "@/components/plaid-connect-button";
import { BridgeKycButton } from "@/components/bridge-kyc-button";
import { ReceiverDashboard } from "@/components/receiver-dashboard";
import type { PlaidAchAccount, PlaidIdentitySnapshot, TransferSummary } from "@/types/receiver";
import type { Session } from "@/types/session";

const DIGIT_REGEX = /\D+/g;
const HEX_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const ALL_ACCOUNTS_KEY = "__ALL__";
const PLAID_STORAGE_PREFIX = "bluewallet:plaid:v1";

function sanitizeDigits(value: string | null | undefined): string {
  return typeof value === "string" ? value.replace(DIGIT_REGEX, "") : "";
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

    list.push({
      accountId: account.accountId,
      accountNumber,
      routingNumber,
      wireRoutingNumber: account.wireRoutingNumber ?? null,
      mask: account.mask ?? accountNumber.slice(-4),
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

    return {
      identity: {
        names: Array.isArray(identity.names) ? identity.names : [],
        emails: Array.isArray(identity.emails) ? identity.emails : [],
        phones: Array.isArray(identity.phones) ? identity.phones : [],
        addresses: Array.isArray(identity.addresses) ? identity.addresses : [],
        achAccounts: Array.isArray(identity.achAccounts) ? identity.achAccounts : [],
      },
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
  const { ready, authenticated, login, logout, getAccessToken } = usePrivy();

  const [session, setSession] = useState<Session | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Identity verification (Bridge-hosted KYC)
  const [personaVerified, setPersonaVerified] = useState<boolean | null>(null);

  // Plaid / receiver dashboard
  const [plaidIdentity, setPlaidIdentity] = useState<PlaidIdentitySnapshot | null>(null);
  const [linkedAccounts, setLinkedAccounts] = useState<PlaidAchAccount[]>([]);
  const [selectedAccountKey, setSelectedAccountKey] = useState<string>(ALL_ACCOUNTS_KEY);
  const [transferSummaries, setTransferSummaries] = useState<TransferSummary[]>([]);
  const [isTransfersLoading, setIsTransfersLoading] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [plaidHydrated, setPlaidHydrated] = useState(false);

  // Withdraw
  const [withdrawInputs, setWithdrawInputs] = useState<Record<string, string>>({});
  const [withdrawLoading, setWithdrawLoading] = useState<Record<string, boolean>>({});
  const [withdrawErrors, setWithdrawErrors] = useState<Record<string, string | null>>({});
  const [withdrawSuccess, setWithdrawSuccess] = useState<Record<string, string | null>>({});

  const authedFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const token = await getAccessToken();
      const headers = new Headers(init.headers);
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return fetch(input, { ...init, headers });
    },
    [getAccessToken]
  );

  useEffect(() => {
    void fetch("/api/db/init-table", { method: "POST" }).catch((error) => {
      console.error("Failed to initialize table:", error);
    });
  }, []);

  // Establish (or clear) the app session based on Privy auth state. The userId
  // is resolved server-side from the verified Privy token, never the client.
  useEffect(() => {
    if (!ready) {
      return;
    }

    if (!authenticated) {
      setSession(null);
      setPersonaVerified(null);
      return;
    }

    let cancelled = false;

    const establish = async () => {
      try {
        const response = await authedFetch("/api/auth/session", { method: "POST" });
        const data = await response.json();
        if (!response.ok || !data.userId) {
          throw new Error(data.message ?? "Unable to establish your session.");
        }
        if (!cancelled) {
          setSession({ userId: data.userId, email: data.email ?? undefined });
          setPersonaVerified(Boolean(data.personaVerificationCompleted));
        }
      } catch (error) {
        if (!cancelled) {
          setAuthError(
            error instanceof Error ? error.message : "Unable to establish your session."
          );
        }
      }
    };

    void establish();

    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, authedFetch]);

  const fetchTransfersForAccounts = useCallback(async (accounts: PlaidAchAccount[]) => {
    if (!accounts || accounts.length === 0) {
      setTransferSummaries([]);
      setTransferError("No bank accounts detected from Plaid verification.");
      return;
    }

    setIsTransfersLoading(true);
    setTransferError(null);

    const uniqueCoordinates = new Map<
      string,
      { accountNumber: string; routingNumber: string; last4: string }
    >();

    for (const account of accounts) {
      const rawAccount = sanitizeDigits(account.accountNumber);
      const rawRouting = sanitizeDigits(account.routingNumber);
      if (!rawAccount || !rawRouting) {
        continue;
      }
      const last4 = sanitizeDigits(account.mask) || rawAccount.slice(-4);
      const key = `${rawRouting}:${rawAccount}:${last4}`;
      if (!uniqueCoordinates.has(key)) {
        uniqueCoordinates.set(key, { accountNumber: rawAccount, routingNumber: rawRouting, last4 });
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

      const deduped = new Map<string, TransferSummary>();
      for (const item of lookups.flat()) {
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
      setTransferSummaries([]);
      setTransferError(
        error instanceof Error ? error.message : "Unexpected error loading transfer information."
      );
    } finally {
      setIsTransfersLoading(false);
    }
  }, []);

  // Hydrate any previously linked Plaid data for the signed-in user.
  useEffect(() => {
    if (!session || plaidHydrated) {
      return;
    }

    let cancelled = false;
    let preferredSelectedKey = ALL_ACCOUNTS_KEY;

    const stored = loadStoredPlaidSnapshot(session.userId);
    if (stored) {
      const mergedAccounts = mergeAchAccounts([], normalizeAchAccounts(stored.identity.achAccounts));
      if (mergedAccounts.length > 0) {
        const candidateSelectedKey =
          stored.selectedAccountKey &&
          (stored.selectedAccountKey === ALL_ACCOUNTS_KEY ||
            mergedAccounts.some((account) => getAccountKey(account) === stored.selectedAccountKey))
            ? stored.selectedAccountKey
            : ALL_ACCOUNTS_KEY;
        preferredSelectedKey = candidateSelectedKey;
        setPlaidIdentity({ ...stored.identity, achAccounts: mergedAccounts });
        setLinkedAccounts(mergedAccounts);
        setSelectedAccountKey(candidateSelectedKey);
      }
    }

    const hydrate = async () => {
      let shouldMarkHydrated = true;
      try {
        const response = await authedFetch(
          `/api/db/user?userId=${encodeURIComponent(session.userId)}`
        );
        if (!response.ok) {
          if (response.status === 404) {
            shouldMarkHydrated = false;
          }
          return;
        }

        const data = await response.json();
        const user = data.user as Record<string, unknown>;

        const storedAccountsRaw = Array.isArray(user?.plaidAchAccounts)
          ? (user.plaidAchAccounts as PlaidAchAccount[])
          : [];

        if (!user?.plaidVerificationCompleted || storedAccountsRaw.length === 0) {
          return;
        }

        const mergedAccounts = mergeAchAccounts([], normalizeAchAccounts(storedAccountsRaw));
        if (mergedAccounts.length === 0) {
          return;
        }

        const identitySnapshot = (user.plaidIdentitySnapshot ?? null) as PlaidIdentitySnapshot | null;

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

        const candidateSelectedKey =
          preferredSelectedKey === ALL_ACCOUNTS_KEY ||
          mergedAccounts.some((account) => getAccountKey(account) === preferredSelectedKey)
            ? preferredSelectedKey
            : ALL_ACCOUNTS_KEY;

        setPlaidIdentity(fallbackIdentity);
        setLinkedAccounts(mergedAccounts);
        setSelectedAccountKey(candidateSelectedKey);
      } catch (error) {
        console.error("[Plaid Hydration] Failed:", error);
      } finally {
        if (!cancelled && shouldMarkHydrated) {
          setPlaidHydrated(true);
        }
      }
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [session, plaidHydrated, authedFetch]);

  // Refresh transfers when the selected accounts change.
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
  }, [selectedAccountKey, linkedAccounts, fetchTransfersForAccounts]);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Privy logout failed", error);
    } finally {
      setSession(null);
      setPersonaVerified(null);
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
  }, [logout]);

  const handlePlaidSuccess = async (identityData: PlaidIdentitySnapshot) => {
    const mergedAccounts = mergeAchAccounts(
      linkedAccounts,
      normalizeAchAccounts(identityData.achAccounts)
    );

    const nextSelectedKey =
      selectedAccountKey === ALL_ACCOUNTS_KEY
        ? ALL_ACCOUNTS_KEY
        : mergedAccounts.some((account) => getAccountKey(account) === selectedAccountKey)
          ? selectedAccountKey
          : mergedAccounts.length > 0
            ? getAccountKey(mergedAccounts[0])
            : ALL_ACCOUNTS_KEY;

    const nextIdentity: PlaidIdentitySnapshot = { ...identityData, achAccounts: mergedAccounts };

    setLinkedAccounts(mergedAccounts);
    setSelectedAccountKey(nextSelectedKey);
    setPlaidIdentity(nextIdentity);
    setAuthError(null);

    if (!session) {
      return;
    }

    const snapshotTimestamp = new Date().toISOString();
    saveStoredPlaidSnapshot(session.userId, {
      identity: nextIdentity,
      selectedAccountKey: nextSelectedKey,
      updatedAt: snapshotTimestamp,
    });

    try {
      await authedFetch("/api/db/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    } catch (dbError) {
      console.error("[Plaid Save] Failed to store Plaid data:", dbError);
    }
  };

  const handlePlaidError = (error: string) => {
    setAuthError(error);
    setTransferSummaries([]);
    setTransferError(error);
  };

  const handleDisconnectPlaid = useCallback(async () => {
    if (!session) {
      return;
    }

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(getPlaidStorageKey(session.userId));
    }

    setLinkedAccounts([]);
    setPlaidIdentity(null);
    setSelectedAccountKey(ALL_ACCOUNTS_KEY);
    setTransferSummaries([]);
    setPlaidHydrated(false);
  }, [session]);

  const handleWithdrawInputChange = useCallback((transferId: string, value: string) => {
    setWithdrawInputs((previous) => ({ ...previous, [transferId]: value }));
    setWithdrawErrors((previous) => ({ ...previous, [transferId]: null }));
    setWithdrawSuccess((previous) => ({ ...previous, [transferId]: null }));
  }, []);

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

      setWithdrawLoading((previous) => ({ ...previous, [summary.transferId]: true }));
      setWithdrawErrors((previous) => ({ ...previous, [summary.transferId]: null }));
      setWithdrawSuccess((previous) => ({ ...previous, [summary.transferId]: null }));

      try {
        const response = await authedFetch(`/api/transfers/${summary.transferId}/withdraw`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetAddress: destinationInput }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message ?? data.error ?? "Withdrawal failed.");
        }

        // Bridge transfers settle asynchronously: txHash may be null (pending).
        setWithdrawSuccess((previous) => ({
          ...previous,
          [summary.transferId]: typeof data.txHash === "string" ? data.txHash : null,
        }));
        setWithdrawInputs((previous) => ({ ...previous, [summary.transferId]: "" }));

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
        setWithdrawLoading((previous) => ({ ...previous, [summary.transferId]: false }));
      }
    },
    [authedFetch, fetchTransfersForAccounts, linkedAccounts, selectedAccountKey, withdrawInputs]
  );

  // --- Render: loading Privy / establishing session ----------------------
  if (!ready || (authenticated && !session)) {
    return (
      <section className="max-w-md mx-auto rounded-2xl border border-slate-200/80 bg-white/70 p-6 text-center text-slate-500 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-400">
        Loading…
      </section>
    );
  }

  // --- Render: signed out -------------------------------------------------
  if (!session) {
    return (
      <section className="max-w-md mx-auto rounded-2xl border border-slate-200/80 bg-white/70 p-6 text-slate-700 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200">
        <Card className="border-0 shadow-none bg-transparent">
          <CardHeader className="space-y-3 text-center pb-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Sign in to Blue Wallet
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Sign in with your email, then verify your identity to unlock your wallet.
            </p>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {authError && (
              <p className="mb-3 text-xs text-red-600 dark:text-red-400 text-center">{authError}</p>
            )}
            <Button
              type="button"
              onClick={() => login()}
              className="w-full h-9 text-sm font-semibold bg-blue-600 hover:bg-blue-700"
            >
              Sign in
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  // --- Render: signed in, awaiting identity verification ------------------
  if (personaVerified === false) {
    return (
      <section className="max-w-md mx-auto rounded-2xl border border-slate-200/80 bg-white/70 p-6 text-center text-slate-700 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Verify your identity</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Complete a quick identity check (powered by Bridge) to earn your blue verification badge and
          unlock your wallet.
        </p>
        {authError && (
          <p className="mt-3 text-xs text-red-600 dark:text-red-400">{authError}</p>
        )}
        <div className="mt-5">
          <BridgeKycButton
            onVerified={() => {
              setAuthError(null);
              setPersonaVerified(true);
            }}
            onError={(message) => setAuthError(message)}
          />
        </div>
        <div className="mt-4">
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-slate-500">
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </section>
    );
  }

  // Verification state still loading.
  if (personaVerified === null) {
    return (
      <section className="max-w-md mx-auto rounded-2xl border border-slate-200/80 bg-white/70 p-6 text-center text-slate-500 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-400">
        Loading your account…
      </section>
    );
  }

  // --- Render: verified dashboard -----------------------------------------
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={handleLogout} className="text-slate-500">
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </Button>
      </div>

      {!plaidIdentity ? (
        <section className="mx-auto max-w-md rounded-3xl border border-slate-200/80 bg-white/70 p-8 text-center text-slate-700 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200">
          <h2 className="text-2xl font-bold tracking-tight">Connect Your Bank</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Link your bank account to start receiving funds
          </p>
          <div className="mt-6">
            <PlaidConnectButton
              userId={session.userId}
              onSuccess={handlePlaidSuccess}
              onError={handlePlaidError}
            />
          </div>
        </section>
      ) : (
        <ReceiverDashboard
          session={session}
          linkedAccounts={linkedAccounts}
          transferSummaries={transferSummaries}
          isTransfersLoading={isTransfersLoading}
          onRefreshTransfers={fetchTransfersForAccounts.bind(null, linkedAccounts)}
          onWithdraw={handleWithdraw}
          withdrawInputs={withdrawInputs}
          onWithdrawInputChange={handleWithdrawInputChange}
          withdrawLoading={withdrawLoading}
          withdrawErrors={withdrawErrors}
          withdrawSuccess={withdrawSuccess}
          onDisconnectPlaid={handleDisconnectPlaid}
        />
      )}
    </div>
  );
}
