"use client";

import { useMemo, useState } from "react";

import { Auth, type AuthConfig } from "@turnkey/sdk-react";
import { CheckCircle2, LogOut, Wand2, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";

const MOCK_ADDRESSES = [
  "0x8f3a4b2c1d0e9f87654321abcdeffedcba987654",
  "0x4c9b1d2e3f4567890abcdeffedcba9876543210f",
  "0x7a1bc23d4e5f67890abcdef1234567890fedcba",
];

function pickMockAddress(prev?: string | null) {
  const options = prev ? MOCK_ADDRESSES.filter((addr) => addr !== prev) : MOCK_ADDRESSES;
  return options[Math.floor(Math.random() * options.length)];
}

export function AuthFlow() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [mockWalletAddress, setMockWalletAddress] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [session, setSession] = useState<unknown>(null);

  const authConfig = useMemo<AuthConfig>(() => {
    const enableEmail = process.env.NEXT_PUBLIC_TURNKEY_ENABLE_EMAIL?.toLowerCase() !== "false";
    const enablePasskey = process.env.NEXT_PUBLIC_TURNKEY_ENABLE_PASSKEY?.toLowerCase() !== "false";
    const enablePhone = process.env.NEXT_PUBLIC_TURNKEY_ENABLE_PHONE?.toLowerCase() === "true";
    const enableGoogle = process.env.NEXT_PUBLIC_TURNKEY_ENABLE_GOOGLE?.toLowerCase() !== "false";
    const enableApple = process.env.NEXT_PUBLIC_TURNKEY_ENABLE_APPLE?.toLowerCase() === "true";
    const enableFacebook = process.env.NEXT_PUBLIC_TURNKEY_ENABLE_FACEBOOK?.toLowerCase() === "true";
    const sessionSeconds = Number(process.env.NEXT_PUBLIC_TURNKEY_SESSION_SECONDS ?? "3600");

    return {
      emailEnabled: enableEmail,
      passkeyEnabled: enablePasskey,
      phoneEnabled: enablePhone,
      googleEnabled: enableGoogle,
      appleEnabled: enableApple,
      facebookEnabled: enableFacebook,
      socialLinking: true,
      sessionLengthSeconds: Number.isFinite(sessionSeconds) ? sessionSeconds : 3600,
    } satisfies AuthConfig;
  }, []);

  const configOrder = useMemo(() => {
    const defaultOrder: Array<"socials" | "email" | "phone" | "passkey"> = [
      "socials",
      "email",
      "phone",
      "passkey",
    ];

    const override = process.env.NEXT_PUBLIC_TURNKEY_AUTH_ORDER?.split(",").map((item) => item.trim()) ?? [];
    const validOverride = override.filter((item): item is typeof defaultOrder[number] =>
      ["socials", "email", "phone", "passkey"].includes(item)
    );

    return validOverride.length > 0 ? validOverride : defaultOrder;
  }, []);

  const handleAuthSuccess = (result: unknown) => {
    setSession(result);
    setAuthError(null);
  };

  const handleAuthError = (error: unknown) => {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Something went wrong while signing in.";
    setAuthError(message);
  };

  const handleLogout = () => {
    setSession(null);
    setMockWalletAddress(null);
  };

  const connectedWallets: Array<{ address: string }> = useMemo(() => {
    if (!session || typeof session !== "object") {
      return [];
    }

    const maybeUser = (session as { user?: unknown }).user;
    const maybeWalletList =
      (maybeUser as { wallets?: Array<{ address?: string }> } | undefined)?.wallets ??
      (session as { wallets?: Array<{ address?: string }> }).wallets;

    if (!Array.isArray(maybeWalletList)) {
      return [];
    }

    return maybeWalletList.filter((wallet): wallet is { address: string } =>
      Boolean(wallet && typeof wallet.address === "string" && wallet.address.length > 0)
    );
  }, [session]);

  const userIdentifier = useMemo(() => {
    if (!session || typeof session !== "object") {
      return "friend";
    }

    const maybeUser = (session as { user?: Record<string, unknown> }).user;
    if (!maybeUser || typeof maybeUser !== "object") {
      return "friend";
    }

    const emailFromRoot = (maybeUser as { email?: string }).email;
    if (emailFromRoot) return emailFromRoot;

    const emailAddress = (maybeUser as { emailAddress?: string }).emailAddress;
    if (emailAddress) return emailAddress;

    const emails = (maybeUser as { emails?: unknown }).emails;
    if (Array.isArray(emails)) {
      const flattened = emails
        .map((entry) => {
          if (typeof entry === "string") return entry;
          if (entry && typeof entry === "object") {
            return (entry as { email?: string; address?: string }).email ?? (entry as { email?: string; address?: string }).address;
          }
          return null;
        })
        .filter((value): value is string => Boolean(value));
      if (flattened.length > 0) {
        return flattened[0];
      }
    }

    const username = (maybeUser as { username?: string }).username;
    if (username) return username;

    const userId = (maybeUser as { userId?: string }).userId;
    if (userId) return userId;

    const id = (session as { userId?: string; id?: string }).userId ?? (session as { id?: string }).id;
    return id ?? "friend";
  }, [session]);

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
      <section className="rounded-3xl border border-slate-200/80 bg-white/70 p-8 text-slate-600 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-300">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Step one
        </h2>
        <p className="mt-4 max-w-xl text-lg leading-7">
          Sign in with Turnkey to start linking your identity to a wallet. Pick the login option
          that feels right—socials, email, passkey—all supported out of the box.
        </p>
        <div className="mt-8 rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm dark:border-slate-800/60 dark:bg-slate-900/70">
          <Auth
            authConfig={authConfig}
            configOrder={configOrder}
            onAuthSuccess={handleAuthSuccess}
            onError={handleAuthError}
          />
        </div>
        {authError && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">{authError}</p>
        )}
      </section>
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
