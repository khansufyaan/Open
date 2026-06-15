"use client";

import { useCallback, useEffect, useState } from "react";

import { usePrivy } from "@privy-io/react-auth";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  Copy,
  LogOut,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { BridgeKycButton } from "@/components/bridge-kyc-button";

type PortalState = {
  user: { userId: string; email: string | null; fullName: string | null };
  onboarding: {
    signedIn: boolean;
    kycStatus: string;
    kycCompleted: boolean;
    onboardingCompleted: boolean;
    provisionSource: string | null;
  };
  wallet: { address: string; chain: string; balance: string; currency: string } | null;
  virtualAccount: {
    accountNumber: string;
    routingNumber: string;
    wireRoutingNumber?: string | null;
    bankName?: string | null;
    beneficiaryName?: string | null;
    bankAddress?: string | null;
    paymentRails?: string[];
  } | null;
  transactions: Array<{
    id: string;
    direction: "send" | "receive";
    amount: string;
    currency: string;
    counterparty?: string | null;
    status: string;
    txHash?: string | null;
    createdAt: string;
  }>;
};

const HEX_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1 text-xs font-medium text-blue-300 hover:text-blue-200 transition"
      aria-label={`Copy ${label ?? "value"}`}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-blue-400/15 bg-blue-950/40 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs uppercase tracking-wide text-blue-300/70">{label}</span>
        <CopyButton value={value} label={label} />
      </div>
      <p className="mt-1 font-mono text-sm text-white break-all">{value}</p>
    </div>
  );
}

export function Portal() {
  // Privy must be configured for the provider (and usePrivy) to work. Guard here
  // so /app renders a clear message instead of crashing before keys are wired.
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    return (
      <CenteredCard>
        <Wallet className="mx-auto h-10 w-10 text-blue-400" />
        <h1 className="mt-4 text-2xl font-bold text-white">Almost ready</h1>
        <p className="mt-2 text-sm text-blue-200/80">
          The wallet portal is being configured. Check back shortly.
        </p>
      </CenteredCard>
    );
  }
  return <PortalInner />;
}

function PortalInner() {
  const { ready, authenticated, login, logout, getAccessToken } = usePrivy();

  const [state, setState] = useState<PortalState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"receive" | "send">("receive");

  // Send form
  const [sendAmount, setSendAmount] = useState("");
  const [sendTo, setSendTo] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  const authedFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const token = await getAccessToken();
      const headers = new Headers(init.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    },
    [getAccessToken]
  );

  const loadPortal = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authedFetch("/api/portal");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Unable to load your portal.");
      }
      setState(data as PortalState);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load your portal.");
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      setState(null);
      return;
    }
    void loadPortal();
  }, [ready, authenticated, loadPortal]);

  const handleSend = useCallback(async () => {
    setSendError(null);
    setSendSuccess(null);

    if (!sendAmount.trim() || parseFloat(sendAmount) <= 0) {
      setSendError("Enter a valid amount.");
      return;
    }
    if (!HEX_ADDRESS_REGEX.test(sendTo.trim())) {
      setSendError("Enter a valid destination address (0x…).");
      return;
    }

    setSending(true);
    try {
      const response = await authedFetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: sendAmount.trim(), toAddress: sendTo.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Unable to send funds.");
      }
      setSendSuccess(
        data.demo
          ? "Demo transfer recorded. Connect Bridge to move real funds."
          : "Transfer submitted."
      );
      setSendAmount("");
      setSendTo("");
      await loadPortal();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Unable to send funds.");
    } finally {
      setSending(false);
    }
  }, [authedFetch, loadPortal, sendAmount, sendTo]);

  // --- Loading Privy ---
  if (!ready) {
    return <CenteredCard>Loading…</CenteredCard>;
  }

  // --- Signed out ---
  if (!authenticated) {
    return (
      <CenteredCard>
        <Wallet className="mx-auto h-10 w-10 text-blue-400" />
        <h1 className="mt-4 text-2xl font-bold text-white">Welcome to Blue Wallet</h1>
        <p className="mt-2 text-sm text-blue-200/80">
          Sign in to open your bank-linked crypto wallet.
        </p>
        <Button
          onClick={() => login()}
          className="mt-6 w-full h-11 text-base font-semibold gradient-blue hover:opacity-90"
        >
          Sign in
        </Button>
      </CenteredCard>
    );
  }

  // --- Authenticated, loading portal ---
  if (!state) {
    return <CenteredCard>{error ?? "Loading your account…"}</CenteredCard>;
  }

  const { onboarding } = state;

  // --- Needs onboarding / KYC ---
  if (!onboarding.kycCompleted) {
    return (
      <CenteredCard>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/15">
          <ShieldCheck className="h-7 w-7 text-blue-400" />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-white">Let&apos;s get you set up</h1>
        <p className="mt-2 text-sm text-blue-200/80">
          Complete a quick identity check (powered by Bridge) to unlock your wallet, bank
          account number, and routing number.
        </p>
        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
        <div className="mt-6">
          <BridgeKycButton
            fullName={state.user.fullName ?? undefined}
            onVerified={() => {
              setError(null);
              void loadPortal();
            }}
            onError={(message) => setError(message)}
          />
        </div>
        <SignOutLink onClick={logout} />
      </CenteredCard>
    );
  }

  // --- Verified but provisioning still finishing ---
  if (!onboarding.onboardingCompleted || !state.wallet) {
    return (
      <CenteredCard>
        <h1 className="text-2xl font-bold text-white">Setting up your wallet…</h1>
        <p className="mt-2 text-sm text-blue-200/80">
          We&apos;re provisioning your Bridge wallet and bank account. This only takes a moment.
        </p>
        <Button onClick={() => void loadPortal()} disabled={loading} className="mt-6 gradient-blue">
          {loading ? "Checking…" : "Refresh"}
        </Button>
        <SignOutLink onClick={logout} />
      </CenteredCard>
    );
  }

  // --- Full dashboard ---
  const { wallet, virtualAccount, transactions } = state;
  const isDemo = onboarding.provisionSource === "demo";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-emerald-400">
          <ShieldCheck className="h-4 w-4" /> Verified
          {isDemo && (
            <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">
              Demo mode
            </span>
          )}
        </div>
        <button
          onClick={() => logout()}
          className="inline-flex items-center gap-1.5 text-sm text-blue-300 hover:text-blue-200"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>

      {/* Balance */}
      <div className="rounded-3xl bg-gradient-to-br from-blue-500 to-blue-700 p-8 text-white shadow-lg">
        <p className="text-sm font-medium opacity-90">Balance</p>
        <p className="mt-1 text-5xl font-bold tracking-tight">
          {parseFloat(wallet.balance || "0").toFixed(2)}{" "}
          <span className="text-2xl font-semibold opacity-80">{wallet.currency}</span>
        </p>
        <p className="mt-3 text-xs opacity-80">
          {wallet.chain.toUpperCase()} • {state.user.email}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl bg-blue-950/50 p-1">
        <TabButton active={tab === "receive"} onClick={() => setTab("receive")}>
          <ArrowDownToLine className="h-4 w-4" /> Receive
        </TabButton>
        <TabButton active={tab === "send"} onClick={() => setTab("send")}>
          <ArrowUpRight className="h-4 w-4" /> Send
        </TabButton>
      </div>

      {tab === "receive" && (
        <div className="space-y-4">
          <section className="rounded-2xl border border-blue-400/15 bg-blue-950/30 p-5">
            <h2 className="text-sm font-semibold text-white">Receive via bank transfer</h2>
            <p className="mt-1 text-xs text-blue-200/70">
              Send a US wire or ACH to these details — it auto-converts to {wallet.currency} in
              your wallet.
            </p>
            {virtualAccount ? (
              <div className="mt-4 space-y-3">
                <CopyField label="Account number" value={virtualAccount.accountNumber} />
                <CopyField label="Routing number" value={virtualAccount.routingNumber} />
                {virtualAccount.beneficiaryName && (
                  <CopyField label="Beneficiary" value={virtualAccount.beneficiaryName} />
                )}
                {virtualAccount.bankName && (
                  <p className="text-xs text-blue-200/60">Bank: {virtualAccount.bankName}</p>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm text-blue-200/60">No bank account provisioned yet.</p>
            )}
          </section>

          <section className="rounded-2xl border border-blue-400/15 bg-blue-950/30 p-5">
            <h2 className="text-sm font-semibold text-white">Receive on-chain</h2>
            <p className="mt-1 text-xs text-blue-200/70">
              Send {wallet.currency} on {wallet.chain.toUpperCase()} to your wallet address.
            </p>
            <div className="mt-4">
              <CopyField label="Wallet address" value={wallet.address} />
            </div>
          </section>
        </div>
      )}

      {tab === "send" && (
        <section className="rounded-2xl border border-blue-400/15 bg-blue-950/30 p-5">
          <h2 className="text-sm font-semibold text-white">Send {wallet.currency}</h2>
          <div className="mt-4 space-y-3">
            <div>
              <label className="text-xs text-blue-200/70">Amount ({wallet.currency})</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={sendAmount}
                onChange={(e) => setSendAmount(e.target.value)}
                disabled={sending}
                className="mt-1 w-full h-11 rounded-xl border border-blue-400/20 bg-blue-950/60 px-3 text-white placeholder:text-blue-300/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-blue-200/70">Destination address</label>
              <input
                type="text"
                placeholder="0x…"
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
                disabled={sending}
                className="mt-1 w-full h-11 rounded-xl border border-blue-400/20 bg-blue-950/60 px-3 font-mono text-sm text-white placeholder:text-blue-300/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {sendError && <p className="text-xs text-red-400">{sendError}</p>}
            {sendSuccess && <p className="text-xs text-emerald-400">{sendSuccess}</p>}
            <Button
              onClick={() => void handleSend()}
              disabled={sending}
              className="w-full h-11 gradient-blue hover:opacity-90 font-semibold"
            >
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        </section>
      )}

      {/* Activity */}
      <section className="rounded-2xl border border-blue-400/15 bg-blue-950/30 p-5">
        <h2 className="text-sm font-semibold text-white">Activity</h2>
        {transactions.length === 0 ? (
          <p className="mt-3 text-sm text-blue-200/60">No transactions yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {transactions.map((tx) => (
              <li
                key={tx.id}
                className="flex items-center justify-between rounded-xl bg-blue-950/40 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                      tx.direction === "send"
                        ? "bg-blue-500/15 text-blue-300"
                        : "bg-emerald-500/15 text-emerald-300"
                    }`}
                  >
                    {tx.direction === "send" ? (
                      <ArrowUpRight className="h-4 w-4" />
                    ) : (
                      <ArrowDownToLine className="h-4 w-4" />
                    )}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-white">
                      {tx.direction === "send" ? "Sent" : "Received"} {tx.amount} {tx.currency}
                    </p>
                    {tx.counterparty && (
                      <p className="font-mono text-xs text-blue-200/60 truncate max-w-[180px]">
                        {tx.counterparty}
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-xs text-blue-200/50">{tx.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md rounded-3xl border border-blue-400/15 bg-blue-950/30 p-8 text-center text-blue-100 shadow-xl backdrop-blur">
      {children}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
        active ? "bg-blue-500/20 text-white" : "text-blue-200/70 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function SignOutLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={() => onClick()}
      className="mt-5 inline-flex items-center gap-1.5 text-xs text-blue-300/70 hover:text-blue-200"
    >
      <LogOut className="h-3.5 w-3.5" /> Sign out
    </button>
  );
}
