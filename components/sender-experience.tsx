"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";

import { usePrivy, useWallets } from "@privy-io/react-auth";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TransferResponse = {
  transferId: string;
  walletId: string;
  walletAddress: string;
  amount: string;
  status: string;
  accountMask: string;
  routingMask: string;
};

export function SenderExperience() {
  const { ready: privyReady, authenticated, login, connectWallet } = usePrivy();
  const { wallets } = useWallets();
  const [isConnecting, setIsConnecting] = useState(false);
  const [recipientAccountNumber, setRecipientAccountNumber] = useState("");
  const [recipientRoutingNumber, setRecipientRoutingNumber] = useState("");
  const [amount, setAmount] = useState("1000");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<TransferResponse | null>(null);

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
      } catch (submitError) {
        const message =
          submitError instanceof Error ? submitError.message : "Unable to submit transfer.";
        setError(message);
        setTransfer(null);
      } finally {
        setIsSubmitting(false);
      }
    },
    [senderAddress, recipientAccountNumber, recipientRoutingNumber, amount]
  );

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
              onChange={(event) => setRecipientAccountNumber(event.target.value)}
              placeholder="000123456789"
              disabled={isFormDisabled}
            />
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
              onChange={(event) => setRecipientRoutingNumber(event.target.value)}
              placeholder="021000021"
              disabled={isFormDisabled}
              maxLength={9}
            />
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
