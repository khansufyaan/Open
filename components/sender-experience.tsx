"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createPublicClient, encodeFunctionData, http, parseAbi, parseUnits } from "viem";
import type { Hex } from "viem";
import { base } from "viem/chains";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronUp } from "lucide-react";

const DIGIT_REGEX = /\D+/g;
const BASE_CHAIN_ID = base.id;
const BASE_CHAIN_HEX = `0x${BASE_CHAIN_ID.toString(16)}` as const;
const BASE_RPC_URL = process.env.NEXT_PUBLIC_BASE_RPC_URL ?? "https://mainnet.base.org";
const BASE_USDC_CONTRACT = (process.env.NEXT_PUBLIC_BASE_USDC_CONTRACT ?? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913").toLowerCase();
const ERC20_TRANSFER_ABI = parseAbi([
  "function transfer(address to, uint256 value) returns (bool)",
]);
const RAW_COMPANY_WALLET_ADDRESS = process.env.NEXT_PUBLIC_COMPANY_WALLET_ADDRESS;
const COMPANY_WALLET_ADDRESS = RAW_COMPANY_WALLET_ADDRESS
  ? RAW_COMPANY_WALLET_ADDRESS.trim()
  : undefined;

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
  recipientWalletAddress?: string | null;
  recipientWalletId?: string | null;
  recipientWalletName?: string | null;
};

type PastTransfer = {
  transferId: string;
  amount: string;
  createdAt: string;
  fundingStatus: string | null;
  fundingTxHash: string | null;
  recipientLast4: string;
  recipientAccount?: string;
  recipientRouting?: string;
  walletAddress?: string;
  recipientWalletAddress?: string | null;
  recipientWalletId?: string | null;
  recipientWalletName?: string | null;
};

type RecipientPreview = {
  userId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  confidence: "exact" | "mask" | "mask-routing";
  accountMask: string | null;
  routingMask: string | null;
  address?: {
    street: string;
    city: string;
    region: string;
    postal_code: string;
    country: string | null;
  } | null;
};

export function SenderExperience() {
  const { ready: privyReady, authenticated, login, connectWallet, logout } = usePrivy();
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
  const [pastTransfers, setPastTransfers] = useState<PastTransfer[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

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

  const refreshPastTransfers = useCallback(async () => {
    if (!senderAddress) {
      setPastTransfers([]);
      return;
    }

    setIsLoadingHistory(true);

    try {
      const response = await fetch(`/api/transfers?senderAddress=${encodeURIComponent(senderAddress)}`);

      if (!response.ok) {
        throw new Error("Failed to fetch transfer history");
      }

      const data = await response.json();
      setPastTransfers(Array.isArray(data.transfers) ? data.transfers : []);
    } catch (error) {
      console.error("Failed to load transfer history:", error);
      setPastTransfers([]);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [senderAddress]);

  useEffect(() => {
    void refreshPastTransfers();
  }, [refreshPastTransfers]);

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

        void refreshPastTransfers();
      } catch (fundingErr) {
        setFundingError(
          fundingErr instanceof Error ? fundingErr.message : "Failed to fund transfer."
        );
        setTransfer(null);
      }
    },
    [fundTransfer, refreshPastTransfers]
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

  const handleDisconnectWallet = useCallback(async () => {
    setError(null);

    if (!privyReady) {
      setError("Wallet system is not ready. Please try again in a moment.");
      return;
    }

    try {
      await logout();
    } catch (disconnectError) {
      const message =
        disconnectError instanceof Error
          ? disconnectError.message
          : "Failed to disconnect wallet.";
      setError(message);
    }
  }, [privyReady, logout]);

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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 lg:flex-row lg:items-start lg:justify-center">
      <section className="w-full lg:max-w-xl">
        <div className="rounded-3xl border border-slate-200/80 bg-white/70 p-6 text-slate-700 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200">
        <div className="space-y-4">
          <div className="text-center">
            <h1 className="text-3xl font-semibold tracking-tight">Sender</h1>
          </div>

          {!senderAddress ? (
            <div className="flex flex-col items-center gap-3">
              <Button size="lg" onClick={handleConnectWallet} disabled={isConnecting || !privyReady} className="w-full">
                {isConnecting ? "Connecting…" : "Connect wallet"}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs text-slate-600 dark:text-slate-300 font-mono break-all">
                  {senderAddress}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDisconnectWallet}
                  disabled={!privyReady}
                  className="border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
                >
                  Disconnect
                </Button>
              </div>

              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="accountNumber">Account number</Label>
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
                  <Label htmlFor="routingNumber">Routing number</Label>
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

                {preview && preview.length > 0 && (
                  <div className="rounded-lg border border-slate-200/60 bg-slate-50/50 p-3 text-xs dark:border-slate-700/60 dark:bg-slate-800/50 max-h-32 overflow-y-auto">
                    <p className="font-medium text-slate-700 dark:text-slate-200 mb-2">
                      {preview[0].name}
                    </p>
                    <div className="space-y-1">
                      {preview[0].email && (
                        <p className="text-slate-600 dark:text-slate-300">
                          <span className="font-medium">Email:</span> {preview[0].email}
                        </p>
                      )}
                      {preview[0].phone && (
                        <p className="text-slate-600 dark:text-slate-300">
                          <span className="font-medium">Phone:</span> {preview[0].phone}
                        </p>
                      )}
                      {preview[0].address && (
                        <p className="text-slate-600 dark:text-slate-300">
                          <span className="font-medium">Address:</span> {preview[0].address.street}, {preview[0].address.city}, {preview[0].address.region} {preview[0].address.postal_code}
                        </p>
                      )}
                      {preview[0].accountMask && (
                        <p className="text-slate-600 dark:text-slate-300">
                          <span className="font-medium">Account:</span> {preview[0].accountMask}
                        </p>
                      )}
                      {preview[0].routingMask && (
                        <p className="text-slate-600 dark:text-slate-300">
                          <span className="font-medium">Routing:</span> {preview[0].routingMask}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex justify-center">
                  <Button
                    type="submit"
                    size="lg"
                    disabled={isFormDisabled}
                    className="px-8"
                  >
                    {isSubmitting ? "Sending…" : isFunding ? "Confirm in wallet…" : "Send"}
                  </Button>
                </div>

                {COMPANY_WALLET_ADDRESS && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 text-center break-all">
                    Company vault: {COMPANY_WALLET_ADDRESS}
                  </p>
                )}

                {error && (
                  <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>
                )}

                {fundingError && (
                  <p className="text-sm text-red-600 dark:text-red-400 text-center">{fundingError}</p>
                )}

                {transfer && (
                  <div className="rounded-3xl border border-emerald-200/70 bg-emerald-50/70 p-5 text-left text-emerald-800 shadow-sm dark:border-emerald-800/60 dark:bg-emerald-900/60 dark:text-emerald-100">
                    <p className="text-sm font-semibold">Deposit confirmed</p>
                    <p className="mt-1 text-xs text-emerald-900/80 dark:text-emerald-100/80">
                      {transfer.amount} USDC is now in the BlueWallet company vault. The recipient’s dedicated warehouse wallet was provisioned and will receive the vault funds once they claim.
                    </p>
                    <dl className="mt-3 space-y-2 text-[11px]">
                      <div>
                        <dt className="uppercase tracking-wide text-emerald-900/70 dark:text-emerald-100/70">Vault address</dt>
                        <dd className="break-all text-emerald-950 dark:text-emerald-50">{transfer.walletAddress}</dd>
                      </div>
                      {transfer.recipientWalletAddress && (
                        <div>
                          <dt className="uppercase tracking-wide text-emerald-900/70 dark:text-emerald-100/70">Recipient wallet</dt>
                          <dd className="break-all text-emerald-950 dark:text-emerald-50">
                            {transfer.recipientWalletAddress}
                          </dd>
                        </div>
                      )}
                      {transfer.recipientWalletName && (
                        <div>
                          <dt className="uppercase tracking-wide text-emerald-900/70 dark:text-emerald-100/70">Wallet name</dt>
                          <dd className="break-all text-emerald-950 dark:text-emerald-50">
                            {transfer.recipientWalletName}
                          </dd>
                        </div>
                      )}
                      {transfer.recipientWalletId && (
                        <div>
                          <dt className="uppercase tracking-wide text-emerald-900/70 dark:text-emerald-100/70">Recipient wallet ID</dt>
                          <dd className="break-all text-emerald-950 dark:text-emerald-50">
                            {transfer.recipientWalletId}
                          </dd>
                        </div>
                      )}
                      {transfer.transferId && (
                        <div>
                          <dt className="uppercase tracking-wide text-emerald-900/70 dark:text-emerald-100/70">Transfer ID</dt>
                          <dd className="break-all text-emerald-950 dark:text-emerald-50">{transfer.transferId}</dd>
                        </div>
                      )}
                      {transfer.fundingTxHash && (
                        <div>
                          <dt className="uppercase tracking-wide text-emerald-900/70 dark:text-emerald-100/70">Funding tx</dt>
                          <dd className="break-all text-emerald-950 dark:text-emerald-50">
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
              </form>
            </>
          )}
        </div>
      </div>
    </section>

      {senderAddress && (
        <aside className="w-full lg:w-[22rem] lg:flex-shrink-0 lg:self-start lg:sticky lg:top-6">
          <div className="rounded-3xl border border-slate-200/80 bg-white/70 text-slate-700 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200">
            <button
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
              className="w-full p-6 flex items-center justify-between text-left hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors rounded-3xl"
            >
              <h2 className="text-lg font-semibold">Past transfers</h2>
              {isHistoryOpen ? (
                <ChevronUp className="h-5 w-5 text-slate-400" />
              ) : (
                <ChevronDown className="h-5 w-5 text-slate-400" />
              )}
            </button>

            {isHistoryOpen && (
              <div className="px-6 pb-6 max-h-96 overflow-y-auto">
                {isLoadingHistory ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Loading...</p>
                ) : pastTransfers.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">No past transfers</p>
                ) : (
                  <div className="space-y-3">
                    {pastTransfers
                      .filter((txn) => txn.fundingStatus === "CONFIRMED" || txn.fundingStatus === "FAILED")
                      .map((txn) => (
                      <div
                        key={txn.transferId}
                        className="rounded-lg border border-slate-200/60 bg-white/80 p-3 dark:border-slate-700/60 dark:bg-slate-900/70"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                              ${txn.amount} USDC
                            </p>
                          </div>
                          <span
                            className={`text-xs px-2 py-1 rounded ${
                              txn.fundingStatus === "CONFIRMED"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                                : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                            }`}
                          >
                            {txn.fundingStatus}
                          </span>
                        </div>

                        <div className="space-y-1 mt-2">
                          {txn.recipientAccount && (
                            <p className="text-xs text-slate-600 dark:text-slate-300">
                              <span className="font-medium">Account:</span> {txn.recipientAccount}
                            </p>
                          )}
                          {txn.recipientRouting && (
                            <p className="text-xs text-slate-600 dark:text-slate-300">
                              <span className="font-medium">Routing:</span> {txn.recipientRouting}
                            </p>
                          )}
                          {txn.walletAddress && (
                            <p className="text-xs text-slate-600 dark:text-slate-300 break-all">
                              <span className="font-medium">Wallet:</span> {txn.walletAddress}
                            </p>
                          )}
                        </div>

                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                          {new Date(txn.createdAt).toLocaleDateString()} {new Date(txn.createdAt).toLocaleTimeString()}
                        </p>

                        {txn.fundingTxHash && (
                          <a
                            href={`https://basescan.org/tx/${txn.fundingTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline block mt-2 break-all"
                          >
                            {txn.fundingTxHash}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
