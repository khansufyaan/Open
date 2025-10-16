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

type WalletAccount = {
  walletAccountId: string;
  address: string;
  addressFormat: string;
  curve: string;
  path: string;
};

type WalletSummary = {
  walletId: string;
  walletName: string;
  createdAt: string | null;
  updatedAt: string | null;
  exported: boolean;
  imported: boolean;
  accounts: WalletAccount[];
};

type WalletsResponsePayload = {
  wallets?: WalletSummary[];
  message?: string;
};

function getPayloadMessage(payload: WalletsResponsePayload | null): string | undefined {
  if (!payload) {
    return undefined;
  }

  const { message } = payload;
  return typeof message === "string" ? message : undefined;
}

function getPayloadWallets(payload: WalletsResponsePayload | null): WalletSummary[] {
  if (!payload?.wallets) {
    return [];
  }

  return Array.isArray(payload.wallets) ? payload.wallets : [];
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
  const turnkeyContext = useTurnkey();
  const turnkey = turnkeyContext.turnkey;
  const [wallets, setWallets] = useState<WalletSummary[]>([]);
  const [isWalletsLoading, setIsWalletsLoading] = useState(false);
  const [isCreatingWallet, setIsCreatingWallet] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [plaidIdentity, setPlaidIdentity] = useState<{
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
  } | null>(null);
  const stepsRef = useRef<HTMLDivElement | null>(null);
  const hasWallets = wallets.length > 0;

  const handleScrollToSteps = useCallback(() => {
    stepsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  // Initialize DynamoDB table on component mount
  useEffect(() => {
    const initTable = async () => {
      try {
        await fetch("/api/db/init-table", {
          method: "POST",
        });
      } catch (error) {
        console.error("Failed to initialize table:", error);
        // Don't block the app if table initialization fails
      }
    };

    initTable();
  }, []);

  const loadWallets = useCallback(async () => {
    setIsWalletsLoading(true);
    try {
      const response = await fetch("/api/turnkey/wallets", { method: "GET" });
      let payload: WalletsResponsePayload | null = null;

      try {
        payload = (await response.json()) as WalletsResponsePayload;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        throw new Error(getPayloadMessage(payload) ?? "Unable to load Turnkey wallets.");
      }

      setWallets(getPayloadWallets(payload));
      setAuthError(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to load Turnkey wallets.";
      setAuthError(message);
    } finally {
      setIsWalletsLoading(false);
    }
  }, [setAuthError]);

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

      // Store user data in DynamoDB
      try {
        await fetch("/api/db/user", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: activeSession.userId,
            email: email,
            turnkeySignInCompleted: true,
          }),
        });
      } catch (dbError) {
        console.error("Failed to store user data:", dbError);
        // Don't block the user flow if DB save fails
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
      setWallets([]);
      setPlaidIdentity(null);
      setAuthError(null);
    }
  };

  const handlePlaidSuccess = (identityData: {
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
  }) => {
    setPlaidIdentity(identityData);
    setAuthError(null);
  };

  const handlePlaidError = (error: string) => {
    setAuthError(error);
  };

  const userIdentifier = useMemo(() => session?.userId ?? "friend", [session]);

  const handleCreateWallet = async () => {
    setIsCreatingWallet(true);
    try {
      const response = await fetch("/api/turnkey/wallets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ walletName: `Wallet ${wallets.length + 1}` }),
      });

      let payload: WalletsResponsePayload | null = null;

      try {
        payload = (await response.json()) as WalletsResponsePayload;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        throw new Error(getPayloadMessage(payload) ?? "Unable to create Turnkey wallet.");
      }

      const walletList = getPayloadWallets(payload);
      setWallets(walletList);
      setAuthError(null);

      // Store wallet data in DynamoDB
      if (session && walletList.length > 0) {
        const wallet = walletList[0];
        const walletAddress = wallet.accounts[0]?.address;

        try {
          await fetch("/api/db/user", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              userId: session.userId,
              walletId: wallet.walletId,
              walletAddress: walletAddress,
              walletCreated: true,
            }),
          });
        } catch (dbError) {
          console.error("Failed to store wallet data:", dbError);
          // Don't block the user flow if DB save fails
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to create Turnkey wallet.";
      setAuthError(message);
    } finally {
      setIsCreatingWallet(false);
    }
  };

  useEffect(() => {
    if (!session) {
      setWallets([]);
      return;
    }

    void loadWallets();
  }, [session, loadWallets]);

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
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Step 2 · Create the wallet</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Use the one-click action to provision a managed wallet. Keys stay inside Turnkey&apos;s MPC.
              </p>
              <Button className="mt-4 w-full sm:w-auto" disabled>
                Sign in to create wallet
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
          <Button
            variant="outline"
            size="lg"
            onClick={handleCreateWallet}
            disabled={isCreatingWallet || isWalletsLoading || hasWallets}
          >
            {isCreatingWallet
              ? "Creating wallet..."
              : hasWallets
                ? "Wallet ready"
                : "Create wallet"}
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
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Step 2 · Create the wallet</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Click once to spin up a managed wallet. Turnkey generates key material, applies policies, and
              never exposes the private key to the browser.
            </p>
            {isWalletsLoading ? (
              <Button className="mt-4 w-full sm:w-auto" disabled>
                Checking wallets…
              </Button>
            ) : hasWallets ? (
              <div className="mt-4 flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> Wallet already created
              </div>
            ) : (
              <Button
                className="mt-4 w-full sm:w-auto"
                onClick={handleCreateWallet}
                disabled={isCreatingWallet}
              >
                {isCreatingWallet ? "Creating wallet..." : "Create wallet"}
              </Button>
            )}
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
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Step 4 · Review addresses</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              See every wallet you&apos;ve provisioned and copy addresses for deposits or integrations—all in the
              same vertical flow.
            </p>
            <div className="mt-4 space-y-2">
              {isWalletsLoading ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">Loading wallets…</p>
              ) : wallets.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No Turnkey wallets yet. Create one above to get started.
                </p>
              ) : (
                <ul className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
                  {wallets.map((wallet) => (
                    <li
                      key={wallet.walletId}
                      className="rounded-lg border border-slate-200/70 p-3 dark:border-slate-700/50"
                    >
                      <p className="font-medium text-slate-700 dark:text-slate-100">
                        {wallet.walletName || wallet.walletId}
                      </p>
                      <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        {wallet.walletId}
                      </p>
                      <ul className="mt-2 space-y-1">
                        {wallet.accounts.map((account) => (
                          <li key={account.walletAccountId} className="flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-sky-500" />
                            <span className="truncate">{account.address}</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        </div>
      </section>
    </>
  );
}
