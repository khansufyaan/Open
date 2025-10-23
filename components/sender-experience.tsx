"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createPublicClient, encodeFunctionData, http, parseAbi, parseUnits } from "viem";
import type { Hex } from "viem";
import { base } from "viem/chains";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DIGIT_REGEX = /\D+/g;
const BASE_CHAIN_ID = base.id;
const BASE_CHAIN_HEX = `0x${BASE_CHAIN_ID.toString(16)}` as const;
const BASE_RPC_URL = process.env.NEXT_PUBLIC_BASE_RPC_URL ?? "https://mainnet.base.org";
const BASE_USDC_CONTRACT = (process.env.NEXT_PUBLIC_BASE_USDC_CONTRACT ?? "0x833589fCD6edb6E08f4c7C0dC1bC64ED875FfC4d").toLowerCase();
const ERC20_TRANSFER_ABI = parseAbi([
  "function transfer(address to, uint256 value) returns (bool)",
]);

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
  fundingStatus?: "PENDING" | "CONFIRMED" | "FAILED" | null;
  fundingTxHash?: string | null;
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
  const [pendingTransfer, setPendingTransfer] = useState<TransferResponse | null>(null);
  const [history, setHistory] = useState<Array<{ accountNumber: string; routingNumber: string }>>([]);
  const [preview, setPreview] = useState<RecipientPreview[] | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewControllerRef = useRef<AbortController | null>(null);
  const [isFunding, setIsFunding] = useState(false);
  const [fundingError, setFundingError] = useState<string | null>(null);

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

  const fundTransfer = useCallback(
    async (currentTransfer: TransferResponse, amountValue: string) => {
      const wallet = wallets.find((entry) => entry.type === "ethereum");

      if (!wallet?.address) {
        throw new Error("No connected Ethereum wallet detected.");
      }

      const normalizedAmount = amountValue.trim();

      if (!normalizedAmount) {
        throw new Error("Transfer amount is missing.");
      }

      if (!currentTransfer.walletAddress || !currentTransfer.walletAddress.startsWith("0x")) {
        throw new Error("Recipient wallet address is invalid.");
      }

      let amountUnits: bigint;

      try {
        amountUnits = parseUnits(normalizedAmount, 6);
      } catch (parseError) {
        throw new Error(
          parseError instanceof Error ? parseError.message : "Failed to parse transfer amount."
        );
      }

      if (amountUnits <= BigInt(0)) {
        throw new Error("Transfer amount must be greater than zero.");
      }

      setIsFunding(true);

      const sendFundingStatus = async (
        status: "PENDING" | "CONFIRMED" | "FAILED",
        txHash?: string
      ) => {
        try {
          await fetch(`/api/transfers/${currentTransfer.transferId}/funding`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(txHash ? { status, txHash } : { status }),
          });
        } catch (updateError) {
          console.warn("Failed to update funding status", updateError);
        }
      };

      let txHash: string | undefined;

      try {
        const currentChain = wallet.chainId?.startsWith("eip155:")
          ? Number(wallet.chainId.split(":")[1])
          : null;

        if (currentChain !== BASE_CHAIN_ID) {
          await wallet.switchChain(BASE_CHAIN_HEX);
        }

        const provider = await wallet.getEthereumProvider();

        const data = encodeFunctionData({
          abi: ERC20_TRANSFER_ABI,
          functionName: "transfer",
          args: [currentTransfer.walletAddress as `0x${string}`, amountUnits],
        });

        txHash = (await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: wallet.address,
              to: BASE_USDC_CONTRACT,
              data,
              value: "0x0",
            },
          ],
        })) as string;

        await sendFundingStatus("PENDING", txHash);

        const publicClient = createPublicClient({
          chain: base,
          transport: http(BASE_RPC_URL),
        });

        await publicClient.waitForTransactionReceipt({ hash: txHash as Hex });

        await sendFundingStatus("CONFIRMED", txHash);

        return {
          status: "CONFIRMED" as const,
          txHash,
        };
      } catch (fundingErr) {
        await sendFundingStatus("FAILED", txHash);

        if (fundingErr instanceof Error) {
          throw fundingErr;
        }

        throw new Error("Failed to send USDC funding transaction.");
      } finally {
        setIsFunding(false);
      }
    },
    [wallets]
  );

  const executeFunding = useCallback(
    async (transferToFund: TransferResponse) => {
      setPendingTransfer(transferToFund);
      setFundingError(null);

      try {
        const result = await fundTransfer(transferToFund, transferToFund.amount);

        setPendingTransfer(null);
        setFundingError(null);
        setTransfer({
          ...transferToFund,
          fundingStatus: result.status,
          fundingTxHash: result.txHash,
        });
      } catch (fundingErr) {
        setFundingError(
          fundingErr instanceof Error ? fundingErr.message : "Failed to fund transfer."
        );
        setTransfer(null);
      }
    },
    [fundTransfer]
  );

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

  const isFormDisabled = useMemo(
    () => !senderAddress || isSubmitting || isFunding,
    [senderAddress, isSubmitting, isFunding]
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!senderAddress) {
        setError("Connect a wallet before sending a transfer.");
        return;
      }

      setIsSubmitting(true);
      setError(null);
      setFundingError(null);

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

        const createdTransfer = data.transfer as TransferResponse;
        setTransfer(createdTransfer);

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

        setTransfer(null);
        await executeFunding(createdTransfer);
      } catch (submitError) {
        const message =
          submitError instanceof Error ? submitError.message : "Unable to submit transfer.";
        setError(message);
        setTransfer(null);
      } finally {
        setIsSubmitting(false);
      }
    },
    [senderAddress, recipientAccountNumber, recipientRoutingNumber, amount, history, executeFunding]
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
    <section className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200/80 bg-white/70 p-8 text-slate-700 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200">
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Send USDC</h1>
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                Connect a wallet, enter the recipient’s bank coordinates, and we’ll provision a Turnkey wallet for this transfer before funding it on Base.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button size="lg" onClick={handleConnectWallet} disabled={isConnecting || !privyReady}>
                {senderAddress
                  ? `Connected: ${senderAddress.slice(0, 6)}…${senderAddress.slice(-4)}`
                  : isConnecting
                  ? "Connecting…"
                  : "Connect wallet"}
              </Button>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Make sure your wallet holds both USDC and Base ETH for gas.
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white/70 p-8 text-slate-700 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Transfer details
            </h2>
            <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
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
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Recipient verification
                </h3>
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

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button type="submit" size="lg" disabled={isFormDisabled}>
                  {isSubmitting ? "Sending…" : "Send"}
                </Button>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  We create the wallet first, then prompt you to send USDC on-chain.
                </p>
              </div>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          {error && (
            <div className="rounded-3xl border border-red-200/70 bg-red-50/70 p-6 text-sm text-red-700 shadow-sm dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-200">
              <h3 className="text-base font-semibold">Submission failed</h3>
              <p className="mt-2">{error}</p>
            </div>
          )}

          {pendingTransfer && (
            <div className="rounded-3xl border border-slate-200/80 bg-white/70 p-6 text-sm text-slate-700 shadow-sm dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200">
              <h3 className="text-base font-semibold">Awaiting funding</h3>
              <p className="mt-1">
                {isFunding
                  ? `Approve the ${pendingTransfer.amount} USDC transfer in your wallet to continue.`
                  : fundingError
                  ? "Funding was not completed. Retry to send USDC to the managed wallet."
                  : "Waiting for on-chain confirmation."}
              </p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Recipient wallet details appear after the transaction confirms.
              </p>
              {isFunding && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  A wallet prompt should be visible. Confirm the transaction to continue.
                </p>
              )}
              {fundingError && (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-red-600 dark:text-red-400">Funding failed: {fundingError}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (!pendingTransfer) {
                        return;
                      }
                      void executeFunding(pendingTransfer);
                    }}
                  >
                    Retry funding
                  </Button>
                </div>
              )}
            </div>
          )}

          {transfer && (
            <div className="rounded-3xl border border-emerald-200/70 bg-emerald-50/70 p-6 text-emerald-800 shadow-sm dark:border-emerald-800/60 dark:bg-emerald-900/60 dark:text-emerald-100">
              <h3 className="text-base font-semibold">Transfer funded</h3>
              <p className="mt-1 text-sm">
                {transfer.amount} USDC was sent to the dedicated wallet. Share these details with the recipient for on-chain visibility.
              </p>
              <dl className="mt-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
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
                <div>
                  <dt className="font-medium uppercase tracking-wide">Funding status</dt>
                  <dd className="text-slate-700 dark:text-slate-200">{transfer.fundingStatus ?? "CONFIRMED"}</dd>
                </div>
                {transfer.fundingTxHash && (
                  <div>
                    <dt className="font-medium uppercase tracking-wide">Funding tx</dt>
                    <dd className="break-all text-slate-700 dark:text-slate-200">
                      <a
                        href={`https://basescan.org/tx/${transfer.fundingTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        {transfer.fundingTxHash}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
