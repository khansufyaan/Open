"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePrivy, useWallets } from "@privy-io/react-auth";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DIGIT_REGEX = /\D+/g;

function sanitizeDigits(value: string): string {
  return value.replace(DIGIT_REGEX, "");
}

type TransferResponse = {
  transferId: string;
  walletId: string;
  walletAddress: string;
  amount: string;
  status: string;
  accountMask: string;
  routingMask: string;
};

type RecipientPreview = {
  userId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  confidence: "exact" | "mask" | "mask-routing";
  accountMask: string | null;
  routingMask: string | null;
};

export function SenderExperience() {
  const { ready: privyReady, authenticated, login, connectWallet } = usePrivy();
  const { wallets } = useWallets();
  const [isConnecting, setIsConnecting] = useState(false);
  const [recipientAccountNumber, setRecipientAccountNumber] = useState("");
  const [recipientRoutingNumber, setRecipientRoutingNumber] = useState("");
  const STORAGE_KEY = "blue_wallet_transfer_history";

  const [amount, setAmount] = useState("0.01");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<TransferResponse | null>(null);
  const [history, setHistory] = useState<Array<{ accountNumber: string; routingNumber: string }>>([]);
  const [preview, setPreview] = useState<RecipientPreview[] | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Array<{ accountNumber: string; routingNumber: string }>;
        if (Array.isArray(parsed)) {
          setHistory(parsed);
        }
      }
    } catch (storageError) {
      console.warn("Failed to load transfer history", storageError);
    }
  }, []);

  const handleAccountNumberChange = useCallback(
    (value: string) => {
      const sanitized = sanitizeDigits(value);
      setRecipientAccountNumber(sanitized);

      const matched = history.find((entry) => entry.accountNumber === sanitized);
      if (matched) {
        setRecipientRoutingNumber(matched.routingNumber);
      }
    },
    [history]
  );

  const handleRoutingNumberChange = useCallback(
    (value: string) => {
      const sanitized = sanitizeDigits(value);
      setRecipientRoutingNumber(sanitized);

      const matches = history.filter((entry) => entry.routingNumber === sanitized);
      if (matches.length === 1) {
        setRecipientAccountNumber(matches[0].accountNumber);
      }
    },
    [history]
  );

  const senderAddress = useMemo(() => {
    const evmWallet = wallets.find((wallet) => wallet.type === "ethereum");
    return evmWallet?.address ?? null;
  }, [wallets]);

  const handleConnectWallet = useCallback(async () => {
    setError(null);

    if (!privyReady) {
      setError("Wallet connections are still loading. Please try again in a moment.");
      return;
    }

    setIsConnecting(true);

    try {
      if (!authenticated) {
        await login({ loginMethods: ["wallet"] });
        return;
      }

      if (!senderAddress) {
        await connectWallet();
      }
    } catch (connectionError) {
      const message =
        connectionError instanceof Error
          ? connectionError.message
          : "Failed to connect a wallet.";
      setError(message);
    } finally {
      setIsConnecting(false);
    }
  }, [privyReady, authenticated, login, connectWallet, senderAddress]);

  const isFormDisabled = useMemo(() => !senderAddress || isSubmitting, [senderAddress, isSubmitting]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!senderAddress) {
        setError("Connect a wallet before sending a transfer.");
        return;
      }

      setIsSubmitting(true);
      setError(null);

      try {
        const response = await fetch("/api/transfers", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            senderAddress,
            recipientAccountNumber,
            recipientRoutingNumber,
            amount,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message ?? "Failed to create transfer.");
        }

        setTransfer(data.transfer as TransferResponse);

        try {
          const normalizedEntry = {
            accountNumber: sanitizeDigits(recipientAccountNumber),
            routingNumber: sanitizeDigits(recipientRoutingNumber),
          };

          if (normalizedEntry.accountNumber && normalizedEntry.routingNumber) {
            const nextHistory = [
              normalizedEntry,
              ...history.filter(
                (entry) =>
                  entry.accountNumber !== normalizedEntry.accountNumber ||
                  entry.routingNumber !== normalizedEntry.routingNumber
              ),
            ].slice(0, 5);

            setHistory(nextHistory);

            if (typeof window !== "undefined") {
              window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextHistory));
            }
          }
        } catch (storageError) {
          console.warn("Failed to persist transfer history", storageError);
        }
      } catch (submitError) {
        const message =
          submitError instanceof Error ? submitError.message : "Unable to submit transfer.";
        setError(message);
        setTransfer(null);
      } finally {
        setIsSubmitting(false);
      }
    },
    [senderAddress, recipientAccountNumber, recipientRoutingNumber, amount, history]
  );

  useEffect(() => {
    const accountDigits = sanitizeDigits(recipientAccountNumber);
    const routingDigits = sanitizeDigits(recipientRoutingNumber);

    if (accountDigits.length < 4 || routingDigits.length !== 9) {
      previewControllerRef.current?.abort();
      previewControllerRef.current = null;
      setPreview(null);
      setPreviewError(null);
      setIsPreviewLoading(false);
      return;
    }

    const controller = new AbortController();
    previewControllerRef.current?.abort();
    previewControllerRef.current = controller;

    setIsPreviewLoading(true);
    setPreviewError(null);

    fetch(
      `/api/db/lookup-recipient?accountNumber=${encodeURIComponent(accountDigits)}&routingNumber=${encodeURIComponent(routingDigits)}`,
      { signal: controller.signal }
    )
      .then(async (response) => {
        if (controller.signal.aborted) {
          return;
        }

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          const message = typeof data.message === "string" ? data.message : null;
          if (response.status === 404) {
            setPreview(null);
            setPreviewError(message ?? "No verified recipient found for this account yet.");
          } else {
            throw new Error(message ?? "Recipient lookup failed.");
          }
          return;
        }

        const data = (await response.json()) as { matches: RecipientPreview[] };
        setPreview(Array.isArray(data.matches) ? data.matches : []);
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }
        setPreview(null);
        setPreviewError(error instanceof Error ? error.message : "Recipient lookup failed.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsPreviewLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [recipientAccountNumber, recipientRoutingNumber]);

  return (
    <section className="space-y-10">
      <div className="space-y-4 rounded-3xl border border-slate-200/80 bg-white/70 p-10 text-slate-700 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Send USDC</h1>
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            Connect a wallet via Privy, provide the recipient’s bank coordinates, and we’ll generate a dedicated
            Turnkey wallet for this transfer.
          </p>
        </header>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Button size="lg" onClick={handleConnectWallet} disabled={isConnecting || !privyReady}>
            {senderAddress
              ? `Connected: ${senderAddress.slice(0, 6)}…${senderAddress.slice(-4)}`
              : isConnecting
                ? "Connecting…"
                : "Connect wallet"}
          </Button>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="accountNumber">Recipient account number</Label>
            <Input
              id="accountNumber"
              name="accountNumber"
              inputMode="numeric"
              pattern="[0-9]*"
              required
              value={recipientAccountNumber}
            onChange={(event) => handleAccountNumberChange(event.target.value)}
              placeholder="000123456789"
              disabled={isFormDisabled}
            list="sender-account-history"
            />
          {history.length > 0 && (
            <datalist id="sender-account-history">
              {history.map((entry) => (
                <option
                  key={`${entry.routingNumber}-${entry.accountNumber}`}
                  value={entry.accountNumber}
                  label={`Account ••••${entry.accountNumber.slice(-4)} · Routing ${entry.routingNumber}`}
                />
              ))}
            </datalist>
          )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="routingNumber">Recipient routing number</Label>
            <Input
              id="routingNumber"
              name="routingNumber"
              inputMode="numeric"
              pattern="[0-9]*"
              required
              value={recipientRoutingNumber}
            onChange={(event) => handleRoutingNumberChange(event.target.value)}
              placeholder="021000021"
              disabled={isFormDisabled}
              maxLength={9}
            list="sender-routing-history"
            />
          {history.length > 0 && (
            <datalist id="sender-routing-history">
              {[...new Map(history.map((entry) => [entry.routingNumber, entry.routingNumber])).values()].map((routing) => (
                <option key={routing} value={routing} />
              ))}
            </datalist>
          )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount (USDC)</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              min="0"
              step="0.01"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="1000"
              disabled={isFormDisabled}
            />
          </div>

          <div className="rounded-xl border border-slate-200/70 bg-white/70 p-4 text-sm dark:border-slate-800/60 dark:bg-slate-900/60">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Recipient verification
            </h2>
            {isPreviewLoading ? (
              <p className="mt-2 text-slate-600 dark:text-slate-300">Checking for existing recipient…</p>
            ) : preview && preview.length > 0 ? (
              <ul className="mt-3 space-y-3">
                {preview.map((entry) => (
                  <li key={entry.userId} className="rounded-lg border border-slate-200/60 bg-white/80 p-3 dark:border-slate-700/60 dark:bg-slate-900/70">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-100">
                      {entry.name ?? "Verified recipient"}
                    </p>
                    <dl className="mt-1 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                      {entry.email && (
                        <div className="flex gap-2">
                          <dt className="font-semibold uppercase tracking-wide text-[10px] text-slate-500 dark:text-slate-400">
                            Email
                          </dt>
                          <dd>{entry.email}</dd>
                        </div>
                      )}
                      {entry.phone && (
                        <div className="flex gap-2">
                          <dt className="font-semibold uppercase tracking-wide text-[10px] text-slate-500 dark:text-slate-400">
                            Phone
                          </dt>
                          <dd>{entry.phone}</dd>
                        </div>
                      )}
                      {entry.accountMask && (
                        <div className="flex gap-2">
                          <dt className="font-semibold uppercase tracking-wide text-[10px] text-slate-500 dark:text-slate-400">
                            Account
                          </dt>
                          <dd>{entry.accountMask}</dd>
                        </div>
                      )}
                      {entry.routingMask && (
                        <div className="flex gap-2">
                          <dt className="font-semibold uppercase tracking-wide text-[10px] text-slate-500 dark:text-slate-400">
                            Routing
                          </dt>
                          <dd>{entry.routingMask}</dd>
                        </div>
                      )}
                    </dl>
                    <p className="mt-2 text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      Match confidence: {entry.confidence === "exact" ? "Exact" : entry.confidence === "mask-routing" ? "Mask + routing" : "Mask"}
                    </p>
                  </li>
                ))}
              </ul>
            ) : previewError ? (
              <p className="mt-2 text-slate-500 dark:text-slate-400">{previewError}</p>
            ) : (
              <p className="mt-2 text-slate-500 dark:text-slate-400">
                Enter full bank details to check if a verified recipient already exists.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="submit" size="lg" disabled={isFormDisabled}>
              {isSubmitting ? "Sending…" : "Send"}
            </Button>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              A fresh Turnkey wallet is generated per bank recipient so balances stay private from the
              sender.
            </p>
          </div>
        </form>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {transfer && (
          <div className="space-y-3 rounded-2xl border border-emerald-200/70 bg-emerald-50/70 p-6 text-emerald-800 shadow-sm dark:border-emerald-800/60 dark:bg-emerald-900/60 dark:text-emerald-100">
            <h2 className="text-lg font-semibold">Transfer scheduled</h2>
            <p className="text-sm">
              {transfer.amount} USDC was allocated to a dedicated wallet. Provide these details to the
              recipient for on-chain visibility if needed.
            </p>
            <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              <div>
                <dt className="font-medium uppercase tracking-wide">Wallet address</dt>
                <dd className="break-all text-slate-700 dark:text-slate-200">{transfer.walletAddress}</dd>
              </div>
              <div>
                <dt className="font-medium uppercase tracking-wide">Transfer ID</dt>
                <dd className="break-all text-slate-700 dark:text-slate-200">{transfer.transferId}</dd>
              </div>
              <div>
                <dt className="font-medium uppercase tracking-wide">Account mask</dt>
                <dd className="text-slate-700 dark:text-slate-200">{transfer.accountMask}</dd>
              </div>
              <div>
                <dt className="font-medium uppercase tracking-wide">Routing mask</dt>
                <dd className="text-slate-700 dark:text-slate-200">{transfer.routingMask}</dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    </section>
  );
}
