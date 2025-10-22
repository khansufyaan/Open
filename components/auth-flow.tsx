"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useTurnkey } from "@turnkey/sdk-react";
import type { Session } from "@turnkey/sdk-types";
import { CheckCircle2, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TurnkeyLoginForm } from "@/components/turnkey-login-form";
import { PlaidConnectButton } from "@/components/plaid-connect-button";

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
  walletAddress: string;
  amount: string;
  status: string;
  depositMethod: string;
  createdAt: string;
};

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
  const turnkeyContext = useTurnkey();
  const turnkey = turnkeyContext.turnkey;
  const [authError, setAuthError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [plaidIdentity, setPlaidIdentity] = useState<PlaidIdentitySnapshot | null>(null);
  const [transferSummaries, setTransferSummaries] = useState<TransferSummary[]>([]);
  const [isTransfersLoading, setIsTransfersLoading] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const stepsRef = useRef<HTMLDivElement | null>(null);

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

    const uniqueCoordinates = new Map<string, { accountNumber: string; routingNumber: string }>();

    for (const account of accounts) {
      if (!account.accountNumber || !account.routingNumber) {
        continue;
      }

      const key = `${account.routingNumber}:${account.accountNumber}`;
      if (!uniqueCoordinates.has(key)) {
        uniqueCoordinates.set(key, {
          accountNumber: account.accountNumber,
          routingNumber: account.routingNumber,
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
        Array.from(uniqueCoordinates.values()).map(async ({ accountNumber, routingNumber }) => {
          const response = await fetch(
            `/api/transfers?accountNumber=${encodeURIComponent(accountNumber)}&routingNumber=${encodeURIComponent(routingNumber)}`
          );

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.message ?? "Failed to load transfers for linked account.");
          }

          return Array.isArray(data.transfers) ? (data.transfers as TransferSummary[]) : [];
        })
      );

      const flattened = lookups.flat();

      setTransferSummaries(flattened);

      if (flattened.length === 0) {
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
      setAuthError(null);
      setTransferSummaries([]);
      setTransferError(null);
    }
  };

  const handlePlaidSuccess = async (identityData: PlaidIdentitySnapshot) => {
    setPlaidIdentity(identityData);
    setAuthError(null);

    void fetchTransfersForAccounts(identityData.achAccounts);

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
            plaidVerifiedAccountMask: identityData.achAccounts[0]?.mask,
            plaidVerifiedRoutingNumber: identityData.achAccounts[0]?.routingNumber,
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
            Welcome back, {userIdentifier}
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
        className="space-y-6 rounded-3xl border border-slate-200/80 bg-white/70 p-10 text-slate-700 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Blueprint
        </h2>
        <div className="space-y-6">
          <article className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Step 1 · Verify identity</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Sign in with Turnkey via email OTP. We store the session locally so subsequent actions happen
              without friction.
            </p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Step 2 · Wallet provisioning</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Transfers create new managed wallets automatically. Each ACH destination receives a unique address so senders never see aggregate balances.
            </p>
            <div className="mt-4 flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> Wallets generate as transfers arrive
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Step 3 · Verify bank identity</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Connect your bank account to verify your identity. Plaid securely retrieves your personal information
              from your bank for compliance verification.
            </p>
            {plaidIdentity ? (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" /> Bank verified
                </div>
                <div className="rounded-lg border border-slate-200/70 bg-white/50 p-4 text-sm dark:border-slate-700/50 dark:bg-slate-800/50">
                  <p className="font-medium text-slate-900 dark:text-white">
                    {plaidIdentity.names[0]}
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
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <PlaidConnectButton onSuccess={handlePlaidSuccess} onError={handlePlaidError} />
              </div>
            )}
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Step 4 · Review deposits</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Each bank transfer lands in its own managed wallet. Confirm the allocations below and use the
              wallet addresses for on-chain visibility.
            </p>
            <div className="mt-4 space-y-3">
              {isTransfersLoading ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">Loading deposits…</p>
              ) : transferSummaries.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {transferError ?? "No deposits found for the connected bank account yet."}
                </p>
              ) : (
                <ul className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
                  {transferSummaries.map((summary) => (
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
                      <dl className="mt-2 space-y-1">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5 text-sky-500" />
                          <span className="truncate">{summary.walletAddress}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 dark:text-slate-500">Wallet ID</span>
                          <span className="truncate">{summary.walletId}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 dark:text-slate-500">Recorded</span>
                          <span>
                            {new Date(summary.createdAt).toLocaleString(undefined, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 dark:text-slate-500">Deposit</span>
                          <span className="capitalize">{summary.depositMethod}</span>
                        </div>
                      </dl>
                    </li>
                  ))}
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
