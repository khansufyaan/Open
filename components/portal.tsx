"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import Image from "next/image";
import { usePrivy } from "@privy-io/react-auth";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  Copy,
  CreditCard,
  Lock,
  LogOut,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { PersonaKyc } from "@/components/persona-kyc";

type PortalState = {
  user: { userId: string; email: string | null; fullName: string | null };
  onboarding: {
    signedIn: boolean;
    kycStatus: string;
    kycCompleted: boolean;
    onboardingCompleted: boolean;
    skipped: boolean;
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
  card: {
    id: string;
    brand?: string;
    last4?: string;
    expMonth?: number;
    expYear?: number;
    status?: string;
    type?: string;
    source?: "bridge" | "demo";
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

const PRIMARY_BTN =
  "w-full h-12 rounded-2xl gradient-blue font-semibold press hover:opacity-95 disabled:opacity-60";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Animates a number from 0 → target with an ease-out curve. */
function useCountUp(target: number, durationMs = 750) {
  const [value, setValue] = useState(target);
  const prev = useRef(target);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      prev.current = target;
      return;
    }
    const from = prev.current;
    prev.current = target;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setValue(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}

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
      className="press inline-flex items-center gap-1 text-[12px] font-medium text-white/55 transition hover:text-white"
      aria-label={`Copy ${label ?? "value"}`}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="material-flat rounded-2xl px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="label-cap text-white/40">{label}</span>
        <CopyButton value={value} label={label} />
      </div>
      <p className="mt-2 break-all font-mono text-[13px] tracking-tight text-white/90">{value}</p>
    </div>
  );
}

export function Portal() {
  // Privy must be configured for the provider (and usePrivy) to work. Guard here
  // so /app renders a clear message instead of crashing before keys are wired.
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    return (
      <CenteredCard>
        <Wallet className="mx-auto h-10 w-10 text-blue-300" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">Almost ready</h1>
        <p className="mt-2 text-sm text-white/55">
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
  const [tab, setTab] = useState<"receive" | "send" | "card">("receive");

  // Send form
  const [sendAmount, setSendAmount] = useState("");
  const [sendTo, setSendTo] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  // Card issuance
  const [issuingCard, setIssuingCard] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardNote, setCardNote] = useState<string | null>(null);

  // Animated balance — called unconditionally to respect the rules of hooks.
  const balanceNum = state?.wallet ? parseFloat(state.wallet.balance || "0") : 0;
  const animatedBalance = useCountUp(balanceNum);

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

  // Lets a user reach the dashboard before finishing KYC. Persisted per user so
  // the choice survives reloads; a reminder banner keeps onboarding one tap away.
  const [skipped, setSkipped] = useState(false);
  const userId = state?.user?.userId;

  useEffect(() => {
    if (!userId) return;
    try {
      setSkipped(window.localStorage.getItem(`bluewallet:skipped:${userId}`) === "1");
    } catch {
      setSkipped(false);
    }
  }, [userId]);

  const handleSkip = useCallback(async () => {
    if (userId) {
      try {
        window.localStorage.setItem(`bluewallet:skipped:${userId}`, "1");
      } catch {
        /* ignore storage errors */
      }
    }
    setSkipped(true);
    // Demo-provision a wallet + bank account so the dashboard is populated.
    try {
      await authedFetch("/api/onboarding/skip", { method: "POST" });
      await loadPortal();
    } catch {
      /* dashboard still renders; provisioning can be retried on reload */
    }
  }, [userId, authedFetch, loadPortal]);

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

  const handleIssueCard = useCallback(async () => {
    setCardError(null);
    setCardNote(null);
    setIssuingCard(true);
    try {
      const response = await authedFetch("/api/card", { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Unable to issue a card.");
      }
      if (data.note) setCardNote(data.note);
      await loadPortal();
    } catch (err) {
      setCardError(err instanceof Error ? err.message : "Unable to issue a card.");
    } finally {
      setIssuingCard(false);
    }
  }, [authedFetch, loadPortal]);

  // --- Loading Privy ---
  if (!ready) {
    return <CenteredCard>Loading…</CenteredCard>;
  }

  // --- Signed out ---
  if (!authenticated) {
    return (
      <CenteredCard>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.06] ring-1 ring-white/10">
          <Wallet className="h-7 w-7 text-blue-300" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">
          Welcome to Blue Wallet
        </h1>
        <p className="mt-2 text-sm text-white/55">
          Sign in to open your bank-linked crypto wallet.
        </p>
        <Button onClick={() => login()} className={`mt-7 ${PRIMARY_BTN}`}>
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

  // --- Needs onboarding / KYC (unless the user chose to skip for now) ---
  if (!onboarding.kycCompleted && !skipped && !onboarding.skipped) {
    return (
      <CenteredCard>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.06] ring-1 ring-white/10">
          <ShieldCheck className="h-7 w-7 text-blue-300" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">
          Let&apos;s get you set up
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-white/55">
          Complete a quick identity check (powered by Bridge) to unlock your wallet, bank
          account number, and routing number.
        </p>
        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
        <div className="mt-6">
          <PersonaKyc
            fullName={state.user.fullName ?? undefined}
            referenceId={state.user.userId}
            onVerified={() => {
              setError(null);
              void loadPortal();
            }}
            onError={(message) => setError(message)}
          />
        </div>
        <button
          onClick={() => void handleSkip()}
          className="press mt-4 block w-full text-sm font-medium text-white/50 transition hover:text-white/80"
        >
          Skip for now
        </button>
        <SignOutLink onClick={logout} />
      </CenteredCard>
    );
  }

  // --- Verified but provisioning still finishing (not applicable when skipped) ---
  if (onboarding.kycCompleted && (!onboarding.onboardingCompleted || !state.wallet)) {
    return (
      <CenteredCard>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Setting up your wallet…</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/55">
          We&apos;re provisioning your Bridge wallet and bank account. This only takes a moment.
        </p>
        <Button onClick={() => void loadPortal()} disabled={loading} className={`mt-6 ${PRIMARY_BTN}`}>
          {loading ? "Checking…" : "Refresh"}
        </Button>
        <SignOutLink onClick={logout} />
      </CenteredCard>
    );
  }

  // --- Dashboard ---
  const { wallet, virtualAccount, transactions } = state;
  const isDemo = onboarding.provisionSource === "demo";
  const verified = onboarding.kycCompleted;
  // Wallet/account/card are unlocked once provisioned — real (verified) or demo
  // (skipped). The reminder banner stays until identity is actually verified.
  const provisioned = onboarding.onboardingCompleted && !!wallet;
  const currency = wallet?.currency ?? "USDC";
  const chain = wallet?.chain ?? "base";

  const [intPart, decPart] = animatedBalance.toFixed(2).split(".");

  const tabs = [
    { id: "receive" as const, label: "Receive", icon: ArrowDownToLine },
    { id: "send" as const, label: "Send", icon: ArrowUpRight },
    { id: "card" as const, label: "Card", icon: CreditCard },
  ];
  const activeIndex = tabs.findIndex((t) => t.id === tab);

  return (
    <div className="mx-auto w-full max-w-md space-y-5">
      {/* Status row */}
      <div className="flex items-center justify-between">
        {verified ? (
          <span className="inline-flex items-center gap-2 text-[13px] font-medium text-white/70">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/60" />
            Verified
            {isDemo && (
              <span className="ml-1 rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] text-white/55">
                Demo
              </span>
            )}
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[12px] font-medium text-white/60">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_8px] shadow-amber-400/60" />
            Test mode
          </span>
        )}
        <button
          onClick={() => logout()}
          className="press inline-flex items-center gap-1.5 text-[13px] text-white/45 transition hover:text-white/80"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>

      {/* Test-mode reminder — quiet, informative, stays until verified */}
      {!verified && (
        <div className="material animate-fade-up rounded-3xl p-5">
          <div className="flex items-start gap-3">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-400 shadow-[0_0_10px] shadow-amber-400/50" />
            <div className="min-w-0 flex-1">
              <h2 className="text-[14px] font-semibold text-white">You&apos;re in test mode</h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-white/55">
                These are demo details for previewing the app. Verify your identity to activate a
                real wallet, bank account, routing number, and card.
              </p>
              <div className="mt-4">
                <PersonaKyc
                  fullName={state.user.fullName ?? undefined}
                  referenceId={state.user.userId}
                  onVerified={() => {
                    setError(null);
                    void loadPortal();
                  }}
                  onError={(message) => setError(message)}
                />
              </div>
              {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Balance hero */}
      <div className="hero-card animate-fade-up relative overflow-hidden rounded-[28px] p-8">
        <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/[0.05] blur-2xl" />
        {/* Faint brand watermark */}
        <Image
          src="/FINAL2.png"
          alt=""
          aria-hidden
          width={150}
          height={150}
          className="pointer-events-none absolute -bottom-6 -right-4 select-none opacity-[0.06]"
        />
        <div className="relative flex items-center justify-between">
          <span className="label-cap text-white/45">Balance</span>
          <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-white/70">
            {chain.toUpperCase()}
          </span>
        </div>
        <div className="relative mt-5 flex items-baseline gap-2 tabular-nums tracking-[-0.03em]">
          <span className="text-[46px] font-semibold leading-none text-white">
            {intPart}
            <span className="text-white/40">.{decPart}</span>
          </span>
          <span className="text-[17px] font-medium text-white/55">{currency}</span>
        </div>
        <p className="relative mt-5 truncate text-[12px] text-white/40">{state.user.email}</p>
      </div>

      {provisioned && wallet ? (
        <>
          {/* Segmented control with sliding pill */}
          <div className="material-flat relative grid grid-cols-3 rounded-full p-1">
            <div
              className="absolute inset-y-1 left-1 rounded-full border border-white/10 bg-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
              style={{ width: "calc((100% - 0.5rem) / 3)", transform: `translateX(${activeIndex * 100}%)` }}
            />
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`press relative z-10 flex items-center justify-center gap-2 rounded-full py-2.5 text-[13px] font-medium transition-colors ${
                    active ? "text-white" : "text-white/45 hover:text-white/70"
                  }`}
                >
                  <Icon className="h-4 w-4" /> {t.label}
                </button>
              );
            })}
          </div>

          <div key={tab} className="animate-fade-up">
            {tab === "receive" && (
              <div className="space-y-4">
                <section className="material rounded-3xl p-5">
                  <h2 className="text-[14px] font-semibold text-white">Receive via bank transfer</h2>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-white/50">
                    Send a US wire or ACH to these details — it auto-converts to {wallet.currency} in
                    your wallet.
                  </p>
                  {virtualAccount ? (
                    <div className="mt-4 space-y-2.5">
                      <CopyField label="Account number" value={virtualAccount.accountNumber} />
                      <CopyField label="Routing number" value={virtualAccount.routingNumber} />
                      {virtualAccount.beneficiaryName && (
                        <CopyField label="Beneficiary" value={virtualAccount.beneficiaryName} />
                      )}
                      {virtualAccount.bankName && (
                        <p className="px-1 text-[12px] text-white/40">Bank: {virtualAccount.bankName}</p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-white/45">No bank account provisioned yet.</p>
                  )}
                </section>

                <section className="material rounded-3xl p-5">
                  <h2 className="text-[14px] font-semibold text-white">Receive on-chain</h2>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-white/50">
                    Send {wallet.currency} on {wallet.chain.toUpperCase()} to your wallet address.
                  </p>
                  <div className="mt-4">
                    <CopyField label="Wallet address" value={wallet.address} />
                  </div>
                </section>
              </div>
            )}

            {tab === "send" && (
              <section className="material rounded-3xl p-5">
                <h2 className="text-[14px] font-semibold text-white">Send {wallet.currency}</h2>
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="label-cap text-white/40">Amount ({wallet.currency})</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={sendAmount}
                      onChange={(e) => setSendAmount(e.target.value)}
                      disabled={sending}
                      className="material-flat mt-2 h-12 w-full rounded-2xl px-4 text-white tabular-nums placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  <div>
                    <label className="label-cap text-white/40">Destination address</label>
                    <input
                      type="text"
                      placeholder="0x…"
                      value={sendTo}
                      onChange={(e) => setSendTo(e.target.value)}
                      disabled={sending}
                      className="material-flat mt-2 h-12 w-full rounded-2xl px-4 font-mono text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  {sendError && <p className="text-xs text-red-400">{sendError}</p>}
                  {sendSuccess && <p className="text-xs text-emerald-400">{sendSuccess}</p>}
                  <Button onClick={() => void handleSend()} disabled={sending} className={PRIMARY_BTN}>
                    {sending ? "Sending…" : "Send"}
                  </Button>
                </div>
              </section>
            )}

            {tab === "card" && (
              <section className="material rounded-3xl p-5">
                <h2 className="text-[14px] font-semibold text-white">Your card</h2>
                <p className="mt-1 text-[12.5px] leading-relaxed text-white/50">
                  A Visa card that spends directly from your {currency} balance.
                </p>

                {state.card ? (
                  <div className="mt-4 space-y-3">
                    {/* Card face */}
                    <div className="hero-card relative aspect-[1.586/1] overflow-hidden rounded-[20px] p-5 text-white">
                      <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/[0.06] blur-2xl" />
                      <div className="relative flex items-start justify-between">
                        <span className="text-[12px] font-semibold tracking-[0.12em] text-white/80">
                          BLUE WALLET
                        </span>
                        <CreditCard className="h-6 w-6 text-white/70" />
                      </div>
                      <p className="relative mt-8 font-mono text-[17px] tracking-[0.22em] text-white/90">
                        ••••&nbsp;&nbsp;••••&nbsp;&nbsp;••••&nbsp;&nbsp;{state.card.last4 ?? "0000"}
                      </p>
                      <div className="relative mt-4 flex items-end justify-between text-[11px]">
                        <span className="text-white/55">
                          {state.card.expMonth && state.card.expYear
                            ? `EXP ${String(state.card.expMonth).padStart(2, "0")}/${String(state.card.expYear).slice(-2)}`
                            : ""}
                        </span>
                        <span className="text-[15px] font-semibold italic tracking-tight text-white/90">
                          {(state.card.brand ?? "visa").toUpperCase()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-0.5 capitalize text-white/65">
                        {state.card.type ?? "virtual"}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-0.5 capitalize text-emerald-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        {state.card.status ?? "active"}
                      </span>
                      {state.card.source === "demo" && (
                        <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-0.5 text-amber-300">
                          Demo card
                        </span>
                      )}
                    </div>

                    {(cardNote || state.card.source === "demo") && (
                      <p className="text-[12px] leading-relaxed text-white/45">
                        {cardNote ??
                          "This is a demo card. Real cards require the Cards product enabled on your Bridge account."}
                      </p>
                    )}

                    {state.card.source === "demo" && (
                      <button
                        onClick={() => void handleIssueCard()}
                        disabled={issuingCard}
                        className="material-flat press h-11 w-full rounded-2xl text-[13px] font-medium text-white/80 transition hover:bg-white/[0.06] disabled:opacity-60"
                      >
                        {issuingCard ? "Checking…" : "Try issuing a real card"}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {cardError && <p className="text-xs text-red-400">{cardError}</p>}
                    <Button
                      onClick={() => void handleIssueCard()}
                      disabled={issuingCard}
                      className={PRIMARY_BTN}
                    >
                      {issuingCard ? "Issuing…" : "Get your Blue Card"}
                    </Button>
                  </div>
                )}
              </section>
            )}
          </div>
        </>
      ) : (
        <section className="material rounded-3xl p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.06] ring-1 ring-white/10">
            <Lock className="h-6 w-6 text-white/60" />
          </div>
          <h2 className="mt-3 text-[14px] font-semibold text-white">Send &amp; Receive are locked</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-white/50">
            Finish identity verification above to get your bank account number, routing number, and
            wallet address — then you can send and receive.
          </p>
        </section>
      )}

      {/* Activity */}
      <section className="material rounded-3xl p-5">
        <h2 className="text-[14px] font-semibold text-white">Activity</h2>
        {transactions.length === 0 ? (
          <p className="mt-3 text-sm text-white/40">No transactions yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {transactions.map((tx) => (
              <li
                key={tx.id}
                className="material-flat flex items-center justify-between rounded-2xl px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                      tx.direction === "send"
                        ? "bg-white/[0.06] text-white/70"
                        : "bg-emerald-500/10 text-emerald-300"
                    }`}
                  >
                    {tx.direction === "send" ? (
                      <ArrowUpRight className="h-4 w-4" />
                    ) : (
                      <ArrowDownToLine className="h-4 w-4" />
                    )}
                  </span>
                  <div>
                    <p className="text-[13px] font-medium text-white">
                      {tx.direction === "send" ? "Sent" : "Received"} {tx.amount} {tx.currency}
                    </p>
                    {tx.counterparty && (
                      <p className="max-w-[180px] truncate font-mono text-[11px] text-white/40">
                        {tx.counterparty}
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-[11px] capitalize text-white/40">{tx.status}</span>
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
    <div className="material mx-auto mt-8 w-full max-w-md rounded-[28px] p-8 text-center text-white/90">
      {children}
    </div>
  );
}

function SignOutLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={() => onClick()}
      className="press mt-5 inline-flex items-center gap-1.5 text-xs text-white/40 transition hover:text-white/70"
    >
      <LogOut className="h-3.5 w-3.5" /> Sign out
    </button>
  );
}
