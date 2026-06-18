"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import Image from "next/image";
import { usePrivy } from "@privy-io/react-auth";
import { toast } from "sonner";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  Copy,
  CreditCard,
  Landmark,
  Lock,
  LogOut,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { PersonaKyc } from "@/components/persona-kyc";

type TxDirection = "send" | "receive" | "withdraw";

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
  autoSwap: {
    targetCurrency: string;
    chain: string;
    source?: "bridge" | "demo";
    lastSweepAt?: string;
    updatedAt: string;
  } | null;
  externalAccount: {
    id: string;
    bankName?: string;
    last4?: string;
    accountHolder?: string;
    source?: "bridge" | "demo";
  } | null;
  supportedTargets?: string[];
  transactions: Array<{
    id: string;
    direction: TxDirection;
    amount: string;
    currency: string;
    counterparty?: string | null;
    status: string;
    txHash?: string | null;
    createdAt: string;
  }>;
};

type ActionId = "mint" | "send" | "burn" | "card";

const HEX_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

const PRIMARY_BTN =
  "w-full h-12 rounded-2xl gradient-blue font-semibold press hover:opacity-95 disabled:opacity-60";
const INPUT_CLS =
  "material-flat mt-2 h-12 w-full rounded-2xl px-4 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50";

function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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
          toast.success(`${label ?? "Value"} copied`);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="press inline-flex items-center gap-1 rounded-md text-[12px] font-medium text-white/60 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
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
        <span className="label-cap text-white/55">{label}</span>
        <CopyButton value={value} label={label} />
      </div>
      <p className="mt-2 break-all font-mono text-[13px] tracking-tight text-white/90">{value}</p>
    </div>
  );
}

/** Bottom-sheet on mobile, centered modal on desktop. */
function ActionSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-h-[88vh] overflow-y-auto border border-white/10 bg-[oklch(0.17_0.018_256)] p-5 text-white shadow-2xl top-auto bottom-0 left-0 max-w-full translate-x-0 translate-y-0 rounded-3xl rounded-b-none border-x-0 border-b-0 sm:top-1/2 sm:left-1/2 sm:bottom-auto sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border"
      >
        <DialogTitle className="text-[15px] font-semibold text-white">{title}</DialogTitle>
        <div className="mt-2">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

function CoinPicker({
  coins,
  selected,
  onSelect,
  disabled,
}: {
  coins: string[];
  selected: string;
  onSelect: (c: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {coins.map((c) => {
        const active = selected === c;
        return (
          <button
            key={c}
            onClick={() => onSelect(c)}
            disabled={disabled}
            aria-pressed={active}
            className={`press rounded-full border px-3.5 py-1.5 text-[12px] font-semibold uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 disabled:opacity-60 ${
              active
                ? "border-blue-400/40 bg-blue-500/20 text-white"
                : "border-white/10 bg-white/[0.04] text-white/65 hover:text-white"
            }`}
          >
            {c}
          </button>
        );
      })}
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

  // Which action sheet is open.
  const [action, setAction] = useState<ActionId | null>(null);
  const [mintTab, setMintTab] = useState<"bank" | "crypto">("bank");

  // Send form
  const [sendAmount, setSendAmount] = useState("");
  const [sendTo, setSendTo] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const sendRequestId = useRef<string | null>(null);

  // Burn (cash out) form
  const [burnCurrency, setBurnCurrency] = useState("");
  const [burnAmount, setBurnAmount] = useState("");
  const [burning, setBurning] = useState(false);
  const burnRequestId = useRef<string | null>(null);

  // Link-bank form
  const [showBankForm, setShowBankForm] = useState(false);
  const [bankHolder, setBankHolder] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankRouting, setBankRouting] = useState("");
  const [bankName, setBankName] = useState("");
  const [linkingBank, setLinkingBank] = useState(false);

  // Card issuance
  const [issuingCard, setIssuingCard] = useState(false);
  const [cardNote, setCardNote] = useState<string | null>(null);

  // Auto-convert deposits
  const [autoSwapSaving, setAutoSwapSaving] = useState<string | null>(null);
  const [autoSwapNote, setAutoSwapNote] = useState<string | null>(null);

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
      if (!response.ok) throw new Error(data.message ?? "Unable to load your portal.");
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
    try {
      await authedFetch("/api/onboarding/skip", { method: "POST" });
      await loadPortal();
    } catch {
      /* dashboard still renders; provisioning can be retried on reload */
    }
  }, [userId, authedFetch, loadPortal]);

  const handleSend = useCallback(async () => {
    setSendError(null);
    if (!sendAmount.trim() || parseFloat(sendAmount) <= 0) {
      setSendError("Enter a valid amount.");
      return;
    }
    if (!HEX_ADDRESS_REGEX.test(sendTo.trim())) {
      setSendError("Enter a valid destination address (0x…).");
      return;
    }
    if (!sendRequestId.current) sendRequestId.current = newRequestId();

    setSending(true);
    try {
      const response = await authedFetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: sendAmount.trim(),
          toAddress: sendTo.trim(),
          requestId: sendRequestId.current,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Unable to send funds.");
      toast.success(
        data.demo ? "Demo transfer recorded. Connect Bridge to move real funds." : "Transfer submitted."
      );
      sendRequestId.current = null;
      setSendAmount("");
      setSendTo("");
      setAction(null);
      await loadPortal();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to send funds.";
      setSendError(message);
      toast.error(message);
    } finally {
      setSending(false);
    }
  }, [authedFetch, loadPortal, sendAmount, sendTo]);

  const handleBurn = useCallback(
    async (currency: string) => {
      if (!burnAmount.trim() || parseFloat(burnAmount) <= 0) {
        toast.error("Enter a valid amount.");
        return;
      }
      if (!burnRequestId.current) burnRequestId.current = newRequestId();

      setBurning(true);
      try {
        const response = await authedFetch("/api/burn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currency,
            amount: burnAmount.trim(),
            requestId: burnRequestId.current,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? "Unable to cash out.");
        toast.success(data.demo ? "Demo cash-out recorded." : "Cash-out submitted.");
        burnRequestId.current = null;
        setBurnAmount("");
        setAction(null);
        await loadPortal();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Unable to cash out.");
      } finally {
        setBurning(false);
      }
    },
    [authedFetch, loadPortal, burnAmount]
  );

  const handleLinkBank = useCallback(async () => {
    setLinkingBank(true);
    try {
      const response = await authedFetch("/api/bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountHolder: bankHolder.trim(),
          accountNumber: bankAccount.trim(),
          routingNumber: bankRouting.trim(),
          bankName: bankName.trim() || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Unable to link bank.");
      toast.success("Bank linked");
      setShowBankForm(false);
      setBankAccount("");
      setBankRouting("");
      await loadPortal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to link bank.");
    } finally {
      setLinkingBank(false);
    }
  }, [authedFetch, loadPortal, bankHolder, bankAccount, bankRouting, bankName]);

  const handleIssueCard = useCallback(async () => {
    setCardNote(null);
    setIssuingCard(true);
    try {
      const response = await authedFetch("/api/card", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Unable to issue a card.");
      if (data.note) setCardNote(data.note);
      toast.success(data.card?.source === "demo" ? "Demo card ready" : "Card issued");
      await loadPortal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to issue a card.");
    } finally {
      setIssuingCard(false);
    }
  }, [authedFetch, loadPortal]);

  const handleSetAutoSwap = useCallback(
    async (currency: string) => {
      setAutoSwapNote(null);
      setAutoSwapSaving(currency);
      try {
        const response = await authedFetch("/api/autoswap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currency }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? "Unable to set auto-convert.");
        if (data.note) setAutoSwapNote(data.note);
        toast.success(`You now hold everything as ${currency.toUpperCase()}`);
        await loadPortal();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Unable to set auto-convert.");
      } finally {
        setAutoSwapSaving(null);
      }
    },
    [authedFetch, loadPortal]
  );

  // --- Loading Privy ---
  if (!ready) return <CenteredCard>Loading…</CenteredCard>;

  // --- Signed out ---
  if (!authenticated) {
    return (
      <CenteredCard>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.06] ring-1 ring-white/10">
          <Wallet className="h-7 w-7 text-blue-300" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">Welcome to Blue Wallet</h1>
        <p className="mt-2 text-sm text-white/55">Sign in to open your bank-linked crypto wallet.</p>
        <Button onClick={() => login()} className={`mt-7 ${PRIMARY_BTN}`}>
          Sign in
        </Button>
      </CenteredCard>
    );
  }

  // --- Authenticated, loading portal ---
  if (!state) {
    if (error) return <CenteredCard>{error}</CenteredCard>;
    return <DashboardSkeleton />;
  }

  const { onboarding } = state;

  // --- Needs onboarding / KYC (unless the user chose to skip for now) ---
  if (!onboarding.kycCompleted && !skipped && !onboarding.skipped) {
    return (
      <CenteredCard>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.06] ring-1 ring-white/10">
          <ShieldCheck className="h-7 w-7 text-blue-300" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">Let&apos;s get you set up</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/55">
          Complete a quick identity check (powered by Bridge) to unlock your wallet, bank account
          number, and routing number.
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

  // --- Verified but provisioning still finishing ---
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
  const provisioned = onboarding.onboardingCompleted && !!wallet;
  const currency = wallet?.currency ?? "USDC";
  const chain = wallet?.chain ?? "base";
  const targets = state.supportedTargets ?? ["usdc"];
  const target = (state.autoSwap?.targetCurrency ?? currency).toLowerCase();
  const [intPart, decPart] = animatedBalance.toFixed(2).split(".");

  const actions: Array<{ id: ActionId; label: string; icon: typeof ArrowDownToLine }> = [
    { id: "mint", label: "Mint", icon: ArrowDownToLine },
    { id: "send", label: "Send", icon: ArrowUpRight },
    { id: "burn", label: "Burn", icon: Landmark },
    { id: "card", label: "Card", icon: CreditCard },
  ];

  const openAction = (id: ActionId) => {
    if (id === "burn" && !burnCurrency) setBurnCurrency(target);
    if (id === "burn") setShowBankForm(!state.externalAccount);
    setAction(id);
  };

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

      {/* Test-mode reminder */}
      {!verified && (
        <div className="material animate-fade-up rounded-3xl p-5">
          <div className="flex items-start gap-3">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-400 shadow-[0_0_10px] shadow-amber-400/50" />
            <div className="min-w-0 flex-1">
              <h2 className="text-[14px] font-semibold text-white">You&apos;re in test mode</h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-white/55">
                These are demo details for previewing the app. Verify your identity to activate a real
                wallet, bank account, routing number, and card.
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
      <div className="hero-card grain sheen animate-fade-up relative overflow-hidden rounded-[28px] p-8">
        <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/[0.05] blur-2xl" />
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
        <p className="relative mt-5 truncate text-[12px] text-white/55">{state.user.email}</p>
      </div>

      {provisioned && wallet ? (
        <>
          {/* Action row */}
          <div className="grid grid-cols-4 gap-2">
            {actions.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.id}
                  onClick={() => openAction(a.id)}
                  className="press flex flex-col items-center gap-2 rounded-2xl py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/85">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-[12px] font-medium text-white/75">{a.label}</span>
                </button>
              );
            })}
          </div>

          {/* ---- Mint sheet (money in) ---- */}
          <ActionSheet open={action === "mint"} onClose={() => setAction(null)} title="Mint — add money">
            <p className="text-[12.5px] leading-relaxed text-white/60">
              Add money and hold it as your chosen stablecoin.
            </p>

            <p className="mt-4 label-cap text-white/55">Hold everything as</p>
            <div className="mt-2">
              <CoinPicker
                coins={targets}
                selected={target}
                onSelect={(c) => void handleSetAutoSwap(c)}
                disabled={Boolean(autoSwapSaving)}
              />
            </div>

            {/* Method toggle */}
            <div className="material-flat mt-4 grid grid-cols-2 gap-1 rounded-full p-1">
              {(["bank", "crypto"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMintTab(m)}
                  aria-pressed={mintTab === m}
                  className={`press rounded-full py-2 text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60 ${
                    mintTab === m ? "bg-white/[0.1] text-white" : "text-white/55 hover:text-white/80"
                  }`}
                >
                  {m === "bank" ? "From bank (USD)" : "Crypto"}
                </button>
              ))}
            </div>

            {mintTab === "bank" ? (
              <div className="mt-4 space-y-2.5">
                <p className="text-[12px] text-white/60">
                  Wire or ACH USD to these details — it arrives as{" "}
                  <span className="font-semibold text-white/80">{target.toUpperCase()}</span>.
                </p>
                {virtualAccount ? (
                  <>
                    <CopyField label="Account number" value={virtualAccount.accountNumber} />
                    <CopyField label="Routing number" value={virtualAccount.routingNumber} />
                    {virtualAccount.beneficiaryName && (
                      <CopyField label="Beneficiary" value={virtualAccount.beneficiaryName} />
                    )}
                    {virtualAccount.bankName && (
                      <p className="px-1 text-[12px] text-white/55">Bank: {virtualAccount.bankName}</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-white/45">No bank account provisioned yet.</p>
                )}
              </div>
            ) : (
              <div className="mt-4 space-y-2.5">
                <p className="text-[12px] text-white/60">
                  Send <span className="text-white/80">any supported stablecoin</span> on{" "}
                  {chain.toUpperCase()} to this one address — it auto-converts to{" "}
                  <span className="font-semibold text-white/80">{target.toUpperCase()}</span>, no
                  approval needed.
                </p>
                <CopyField label="Your wallet address" value={wallet.address} />
              </div>
            )}

            {(autoSwapNote || state.autoSwap?.source === "demo") && (
              <p className="mt-3 text-[12px] leading-relaxed text-amber-200/80">
                {autoSwapNote ?? "Demo mode — real auto-convert activates once Bridge is connected."}
              </p>
            )}
          </ActionSheet>

          {/* ---- Send sheet (crypto out) ---- */}
          <ActionSheet open={action === "send"} onClose={() => setAction(null)} title="Send">
            <p className="text-[12.5px] leading-relaxed text-white/60">
              Send {currency} on {chain.toUpperCase()} to any wallet address.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="label-cap text-white/55">Amount ({currency})</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                  disabled={sending}
                  className={`${INPUT_CLS} tabular-nums`}
                />
              </div>
              <div>
                <label className="label-cap text-white/55">Destination address</label>
                <input
                  type="text"
                  placeholder="0x…"
                  value={sendTo}
                  onChange={(e) => setSendTo(e.target.value)}
                  disabled={sending}
                  className={`${INPUT_CLS} font-mono text-sm`}
                />
              </div>
              {sendError && <p className="text-xs text-red-400">{sendError}</p>}
              <Button onClick={() => void handleSend()} disabled={sending} className={PRIMARY_BTN}>
                {sending ? "Sending…" : "Send"}
              </Button>
            </div>
          </ActionSheet>

          {/* ---- Burn sheet (cash out to bank) ---- */}
          <ActionSheet open={action === "burn"} onClose={() => setAction(null)} title="Burn — cash out">
            <p className="text-[12.5px] leading-relaxed text-white/60">
              Convert a stablecoin to USD and send it to your bank account.
            </p>

            {state.externalAccount && !showBankForm ? (
              <div className="mt-4 space-y-3">
                <div className="material-flat flex items-center justify-between rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2 text-[13px] text-white/80">
                    <Landmark className="h-4 w-4 text-white/60" />
                    {state.externalAccount.bankName ?? "Bank"} ••{state.externalAccount.last4 ?? "0000"}
                  </div>
                  <button
                    onClick={() => setShowBankForm(true)}
                    className="press text-[12px] font-medium text-blue-300 hover:text-blue-200"
                  >
                    Change
                  </button>
                </div>

                <div>
                  <label className="label-cap text-white/55">Cash out from</label>
                  <div className="mt-2">
                    <CoinPicker coins={targets} selected={burnCurrency || target} onSelect={setBurnCurrency} />
                  </div>
                </div>
                <div>
                  <label className="label-cap text-white/55">
                    Amount ({(burnCurrency || target).toUpperCase()})
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={burnAmount}
                    onChange={(e) => setBurnAmount(e.target.value)}
                    disabled={burning}
                    className={`${INPUT_CLS} tabular-nums`}
                  />
                </div>
                <Button
                  onClick={() => void handleBurn(burnCurrency || target)}
                  disabled={burning}
                  className={PRIMARY_BTN}
                >
                  {burning ? "Cashing out…" : "Cash out to bank"}
                </Button>
                {state.externalAccount.source === "demo" && (
                  <p className="text-[12px] text-amber-200/80">
                    Demo bank — connect Bridge to move real funds.
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <p className="text-[12px] text-white/60">Link a US bank account to cash out to.</p>
                <div>
                  <label className="label-cap text-white/55">Account holder name</label>
                  <input
                    value={bankHolder}
                    onChange={(e) => setBankHolder(e.target.value)}
                    placeholder="Jane Doe"
                    className={INPUT_CLS}
                  />
                </div>
                <div>
                  <label className="label-cap text-white/55">Account number</label>
                  <input
                    inputMode="numeric"
                    value={bankAccount}
                    onChange={(e) => setBankAccount(e.target.value)}
                    placeholder="000123456789"
                    className={`${INPUT_CLS} font-mono`}
                  />
                </div>
                <div>
                  <label className="label-cap text-white/55">Routing number</label>
                  <input
                    inputMode="numeric"
                    value={bankRouting}
                    onChange={(e) => setBankRouting(e.target.value)}
                    placeholder="9 digits"
                    className={`${INPUT_CLS} font-mono`}
                  />
                </div>
                <div>
                  <label className="label-cap text-white/55">Bank name (optional)</label>
                  <input
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="Chase"
                    className={INPUT_CLS}
                  />
                </div>
                <Button onClick={() => void handleLinkBank()} disabled={linkingBank} className={PRIMARY_BTN}>
                  {linkingBank ? "Linking…" : "Link bank"}
                </Button>
                {state.externalAccount && (
                  <button
                    onClick={() => setShowBankForm(false)}
                    className="press block w-full text-center text-[12px] text-white/55 hover:text-white/80"
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}
          </ActionSheet>

          {/* ---- Card sheet ---- */}
          <ActionSheet open={action === "card"} onClose={() => setAction(null)} title="Your card">
            <p className="text-[12.5px] leading-relaxed text-white/60">
              A Visa card that spends directly from your {currency} balance.
            </p>
            {state.card ? (
              <div className="mt-4 space-y-3">
                <div className="hero-card grain sheen relative aspect-[1.586/1] overflow-hidden rounded-[20px] p-5 text-white">
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
                  <p className="text-[12px] leading-relaxed text-white/55">
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
              <div className="mt-4">
                <Button onClick={() => void handleIssueCard()} disabled={issuingCard} className={PRIMARY_BTN}>
                  {issuingCard ? "Issuing…" : "Get your Blue Card"}
                </Button>
              </div>
            )}
          </ActionSheet>
        </>
      ) : (
        <section className="material rounded-3xl p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.06] ring-1 ring-white/10">
            <Lock className="h-6 w-6 text-white/60" />
          </div>
          <h2 className="mt-3 text-[14px] font-semibold text-white">Your wallet is locked</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-white/60">
            Finish identity verification above to activate Mint, Send, Burn, and your card.
          </p>
        </section>
      )}

      {/* Activity */}
      <section className="material rounded-3xl p-5">
        <h2 className="text-[14px] font-semibold text-white">Activity</h2>
        {transactions.length === 0 ? (
          <p className="mt-3 text-sm text-white/55">No transactions yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {transactions.map((tx) => {
              const out = tx.direction === "send" || tx.direction === "withdraw";
              const verb =
                tx.direction === "send" ? "Sent" : tx.direction === "withdraw" ? "Cashed out" : "Received";
              return (
                <li
                  key={tx.id}
                  className="material-flat flex items-center justify-between rounded-2xl px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                        out ? "bg-white/[0.06] text-white/70" : "bg-emerald-500/10 text-emerald-300"
                      }`}
                    >
                      {tx.direction === "withdraw" ? (
                        <Landmark className="h-4 w-4" />
                      ) : out ? (
                        <ArrowUpRight className="h-4 w-4" />
                      ) : (
                        <ArrowDownToLine className="h-4 w-4" />
                      )}
                    </span>
                    <div>
                      <p className="text-[13px] font-medium text-white">
                        {verb} {tx.amount} {tx.currency}
                      </p>
                      {tx.counterparty && (
                        <p className="max-w-[180px] truncate font-mono text-[11px] text-white/55">
                          {tx.counterparty}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-[11px] capitalize text-white/55">{tx.status}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-md space-y-5" aria-busy="true" aria-label="Loading your wallet">
      <div className="flex items-center justify-between">
        <div className="h-6 w-24 animate-pulse rounded-full bg-white/[0.06]" />
        <div className="h-5 w-16 animate-pulse rounded-full bg-white/[0.06]" />
      </div>
      <div className="h-40 animate-pulse rounded-[28px] bg-white/[0.05]" />
      <div className="h-16 animate-pulse rounded-2xl bg-white/[0.05]" />
      <div className="h-28 animate-pulse rounded-3xl bg-white/[0.05]" />
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
      className="press mt-5 inline-flex items-center gap-1.5 text-xs text-white/55 transition hover:text-white/80"
    >
      <LogOut className="h-3.5 w-3.5" /> Sign out
    </button>
  );
}
