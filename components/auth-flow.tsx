"use client";

import { type ComponentProps, useEffect, useMemo, useState } from "react";

import { useTurnkey } from "@turnkey/sdk-react";
import type { Session } from "@turnkey/sdk-types";
import { CheckCircle2, LogOut, Wand2, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TurnkeyLoginForm } from "@/components/turnkey-login-form";


const MOCK_ADDRESSES = [
  "0x8f3a4b2c1d0e9f87654321abcdeffedcba987654",
  "0x4c9b1d2e3f4567890abcdeffedcba9876543210f",
  "0x7a1bc23d4e5f67890abcdef1234567890fedcba",
];

const TURNKEY_READY = Boolean(
  process.env.NEXT_PUBLIC_TURNKEY_API_BASE_URL && process.env.NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID
);

function pickMockAddress(prev?: string | null) {
  const options = prev ? MOCK_ADDRESSES.filter((addr) => addr !== prev) : MOCK_ADDRESSES;
  return options[Math.floor(Math.random() * options.length)];
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [mockWalletAddress, setMockWalletAddress] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

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


  const handleAuthSuccess = async () => {
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
      setMockWalletAddress(null);
      setAuthError(null);
    }
  };

  const connectedWallets: Array<{ address: string }> = [];

  const userIdentifier = useMemo(() => session?.userId ?? "friend", [session]);

  const handleGenerateWallet = async () => {
    setIsGenerating(true);
    await new Promise((resolve) => setTimeout(resolve, 900));
    setMockWalletAddress((current) => pickMockAddress(current));
    setIsGenerating(false);
  };

  const handleConnectWallet = () => {
    console.warn("Turnkey wallet linking is not yet wired up in this prototype.");
  };

  if (!session) {
    return (
      <>
        <section className="rounded-3xl border border-slate-200/80 bg-white/70 p-8 text-slate-600 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-300">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Step one
          </h2>
          <p className="mt-4 max-w-xl text-lg leading-7">
            Sign in with Turnkey to start linking your identity to a wallet. Pick the login option
            that feels right—socials, email, passkey—all supported out of the box.
          </p>
          <div className="mt-8">
            <Button
              onClick={() => setShowAuthModal(true)}
              className="w-full max-w-sm mx-auto flex h-12 text-base"
            >
              Sign In to Continue
            </Button>
          </div>
          {authError && (
            <p className="mt-4 text-sm text-red-600 dark:text-red-400">{authError}</p>
          )}
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
    <section className="space-y-8 rounded-3xl border border-slate-200/80 bg-white/70 p-8 text-slate-600 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-300">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Step two
          </h2>
          <p className="mt-2 text-lg leading-7 text-slate-600 dark:text-slate-200">
            Welcome back, {userIdentifier}. Choose how you want to carry your identity on-chain.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="justify-start px-3">
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </Button>
      </header>

      <div className="grid gap-6 sm:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm transition hover:border-sky-200 dark:border-slate-800 dark:bg-slate-900/80 dark:hover:border-sky-500/30">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-600 dark:bg-sky-500/10 dark:text-sky-300">
                Existing wallet
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Bring your own keys
              </h3>
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                Connect a wallet you already control. We&apos;ll ask for a quick signature to prove it&apos;s
                really you.
              </p>
            </div>
            <Button variant="secondary" onClick={handleConnectWallet} className="w-full justify-center">
              <Wallet className="mr-2 h-4 w-4" /> Connect wallet
            </Button>
            {connectedWallets.length > 0 && (
              <ul className="space-y-2 text-xs text-slate-500 dark:text-slate-400">
                {connectedWallets.map((wallet) => (
                  <li key={wallet.address} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-sky-500" />
                    <span className="truncate">{wallet.address}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm transition hover:border-sky-200 dark:border-slate-800 dark:bg-slate-900/80 dark:hover:border-sky-500/30">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                Blue wallet (mocked)
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Generate a turnkey wallet
              </h3>
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                Try the managed experience. This button fakes the Turnkey flow so we can shape the
                UI while the integration is in progress.
              </p>
            </div>
            <Button onClick={handleGenerateWallet} disabled={isGenerating} className="w-full justify-center">
              <Wand2 className="mr-2 h-4 w-4" />
              {isGenerating ? "Creating..." : "Generate mock wallet"}
            </Button>
            {mockWalletAddress && (
              <div className="flex items-center gap-2 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200">
                <CheckCircle2 className="h-4 w-4" />
                <span className="truncate">{mockWalletAddress}</span>
              </div>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
