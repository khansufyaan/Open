"use client";

import { useState } from "react";

import { usePrivy } from "@privy-io/react-auth";
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
  const { ready, authenticated, login, logout, user, linkWallet } = usePrivy();
  const [isGenerating, setIsGenerating] = useState(false);
  const [mockWalletAddress, setMockWalletAddress] = useState<string | null>(null);

  const handleGenerateWallet = async () => {
    setIsGenerating(true);
    await new Promise((resolve) => setTimeout(resolve, 900));
    setMockWalletAddress((current) => pickMockAddress(current));
    setIsGenerating(false);
  };

  const handleConnectWallet = async () => {
    try {
      await linkWallet();
    } catch (error) {
      console.error("Wallet connection failed", error);
    }
  };

  if (!ready) {
    return (
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200/70 bg-white/70 p-8 text-slate-600 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-300">
        <div className="h-4 w-24 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="h-10 w-3/4 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />
        <div className="h-20 w-full animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <section className="rounded-3xl border border-slate-200/80 bg-white/70 p-8 text-slate-600 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-300">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Step one
        </h2>
        <p className="mt-4 max-w-xl text-lg leading-7">
          Sign in with Privy to start linking your identity to a wallet. No contracts, no
          jargon—just a gentle handshake before we talk keys.
        </p>
        <Button className="mt-8" onClick={login} size="lg">
          Continue with Privy
        </Button>
      </section>
    );
  }

  const connectedWallets = (user?.wallets ?? []).filter((wallet) => wallet.address);

  return (
    <section className="space-y-8 rounded-3xl border border-slate-200/80 bg-white/70 p-8 text-slate-600 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-300">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Step two
          </h2>
          <p className="mt-2 text-lg leading-7 text-slate-600 dark:text-slate-200">
            Welcome back, {user?.email?.address ?? user?.id}. Choose how you want to carry your
            identity on-chain.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={logout} className="justify-start px-3">
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </Button>
      </header>

      <div className="grid gap-6 sm:grid-cols-2">
        <article className="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm transition hover:border-sky-200 dark:border-slate-800 dark:bg-slate-900/80 dark:hover:border-sky-500/30">
          <div className="space-y-3">
            <div className="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-600 dark:bg-sky-500/10 dark:text-sky-300">
              Existing wallet
            </div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Bring your own keys
            </h3>
            <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
              Connect a wallet you already control. We’ll ask for a quick signature to prove it’s
              really you.
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-3">
            <Button variant="secondary" onClick={handleConnectWallet} className="justify-start">
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

        <article className="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm transition hover:border-sky-200 dark:border-slate-800 dark:bg-slate-900/80 dark:hover:border-sky-500/30">
          <div className="space-y-3">
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
          <div className="mt-6 flex flex-col gap-3">
            <Button onClick={handleGenerateWallet} disabled={isGenerating} className="justify-start">
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
