"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createPublicClient, encodeFunctionData, http, parseAbi, parseUnits } from "viem";
import type { Hex } from "viem";
import { base } from "viem/chains";
import { Button } from "@/components/ui/button";

const DIGIT_REGEX = /\D+/g;
const BASE_CHAIN_ID = base.id;
const BASE_CHAIN_HEX = `0x${BASE_CHAIN_ID.toString(16)}` as const;
const BASE_RPC_URL = process.env.NEXT_PUBLIC_BASE_RPC_URL ?? "https://mainnet.base.org";
const BASE_USDC_CONTRACT = (process.env.NEXT_PUBLIC_BASE_USDC_CONTRACT ?? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913").toLowerCase();
const ERC20_TRANSFER_ABI = parseAbi(["function transfer(address to, uint256 value) returns (bool)"]);

function sanitizeDigits(value: string): string {
  return value.replace(DIGIT_REGEX, "");
}

type TransferResponse = {
  transferId: string;
  walletId: string;
  walletAddress: string;
  depositAddress: string;
  amount: string;
  status: string;
  accountMask: string;
  routingMask: string;
  fundingStatus?: "PENDING" | "CONFIRMED" | "FAILED" | null;
  fundingTxHash?: string | null;
};

export function SenderExperience() {
  const { ready: privyReady, authenticated, login, connectWallet } = usePrivy();
  const { wallets } = useWallets();
  const [isConnecting, setIsConnecting] = useState(false);
  const [accountNumber, setAccountNumber] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<TransferResponse | null>(null);
  const [isFunding, setIsFunding] = useState(false);
  const previewControllerRef = useRef<AbortController | null>(null);
  const [recipientEmail, setRecipientEmail] = useState<string | null>(null);
  const [step, setStep] = useState(1); // 1: amount, 2: recipient, 3: confirm

  const senderAddress = useMemo(() => {
    const evmWallet = wallets.find((wallet) => wallet.type === "ethereum");
    return evmWallet?.address ?? null;
  }, [wallets]);

  const handleConnectWallet = useCallback(async () => {
    setError(null);
    if (!privyReady) return;
    setIsConnecting(true);
    try {
      if (!authenticated) { await login({ loginMethods: ["wallet"] }); return; }
      if (!senderAddress) await connectWallet();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect wallet");
    } finally { setIsConnecting(false); }
  }, [privyReady, authenticated, login, connectWallet, senderAddress]);

  const fundTransfer = useCallback(async (currentTransfer: TransferResponse, amountValue: string) => {
    const wallet = wallets.find((entry) => entry.type === "ethereum");
    if (!wallet?.address) throw new Error("No wallet connected");
    const depositAddress = currentTransfer.depositAddress || currentTransfer.walletAddress;
    if (!depositAddress) throw new Error("Invalid deposit address");

    const amountUnits = parseUnits(amountValue.trim(), 6);
    if (amountUnits <= BigInt(0)) throw new Error("Amount must be greater than zero");

    setIsFunding(true);
    const sendStatus = async (status: string, txHash?: string) => {
      try {
        await fetch(`/api/transfers/${currentTransfer.transferId}/funding`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(txHash ? { status, txHash } : { status }),
        });
      } catch {}
    };

    let txHash: string | undefined;
    try {
      const currentChain = wallet.chainId?.startsWith("eip155:") ? Number(wallet.chainId.split(":")[1]) : null;
      if (currentChain !== BASE_CHAIN_ID) await wallet.switchChain(BASE_CHAIN_HEX);
      const provider = await wallet.getEthereumProvider();
      const data = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: "transfer",
        args: [depositAddress as `0x${string}`, amountUnits],
      });
      txHash = (await provider.request({
        method: "eth_sendTransaction",
        params: [{ from: wallet.address, to: BASE_USDC_CONTRACT, data, value: "0x0" }],
      })) as string;
      await sendStatus("PENDING", txHash);
      const publicClient = createPublicClient({ chain: base, transport: http(BASE_RPC_URL) });
      await publicClient.waitForTransactionReceipt({ hash: txHash as Hex });
      await sendStatus("CONFIRMED", txHash);
      return { status: "CONFIRMED", txHash };
    } catch (e) {
      await sendStatus("FAILED", txHash);
      throw e;
    } finally { setIsFunding(false); }
  }, [wallets]);

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!senderAddress) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderAddress, recipientAccountNumber: accountNumber, recipientRoutingNumber: routingNumber, amount }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Failed to create transfer");
      const createdTransfer = data.transfer as TransferResponse;

      const result = await fundTransfer(createdTransfer, amount);
      setTransfer({ ...createdTransfer, fundingStatus: result.status as "CONFIRMED", fundingTxHash: result.txHash });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transfer failed");
      setTransfer(null);
    } finally { setIsSubmitting(false); }
  }, [senderAddress, accountNumber, routingNumber, amount, fundTransfer]);

  // Lookup recipient
  useEffect(() => {
    const acc = sanitizeDigits(accountNumber);
    const rout = sanitizeDigits(routingNumber);
    if (acc.length < 4 || rout.length !== 9) { setRecipientEmail(null); return; }

    const controller = new AbortController();
    previewControllerRef.current?.abort();
    previewControllerRef.current = controller;

    fetch(`/api/db/lookup-recipient?accountNumber=${acc}&routingNumber=${rout}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) { setRecipientEmail(null); return; }
        const data = await res.json();
        if (data.matches?.[0]?.email) setRecipientEmail(data.matches[0].email);
      })
      .catch(() => setRecipientEmail(null));

    return () => controller.abort();
  }, [accountNumber, routingNumber]);

  const isDisabled = !senderAddress || isSubmitting || isFunding;
  const canProceedToRecipient = parseFloat(amount) > 0;
  const canProceedToConfirm = routingNumber.length === 9 && accountNumber.length >= 4;

  return (
    <div className="absolute inset-0 flex items-center justify-center px-4 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-blue-500/5 blur-[150px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-purple-500/5 blur-[150px]" />
      </div>

      <div className="relative w-full max-w-md z-10">
        {/* Main Card */}
        <div className="relative">
          {/* Glow effect */}
          <div className="absolute -inset-1 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-blue-500/20 rounded-3xl blur-xl opacity-70" />

          <div className="relative bg-card/95 backdrop-blur-xl rounded-3xl border border-border/50 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-border/50">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-foreground">Send USDC</h2>
                <div className="flex items-center gap-1">
                  {[1, 2, 3].map((s) => (
                    <div
                      key={s}
                      className={`w-2 h-2 rounded-full transition-all duration-300 ${
                        step >= s ? 'bg-blue-500' : 'bg-muted'
                      }`}
                    />
                  ))}
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {step === 1 && "Enter amount"}
                {step === 2 && "Recipient details"}
                {step === 3 && "Confirm & send"}
              </p>
            </div>

            {/* Content */}
            <div className="p-6">
              {!senderAddress ? (
                // Connect Wallet State
                <div className="text-center py-8">
                  <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
                    <svg className="w-10 h-10 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Connect Your Wallet</h3>
                  <p className="text-sm text-muted-foreground mb-6">Connect a wallet with USDC to send</p>
                  <Button
                    onClick={handleConnectWallet}
                    disabled={isConnecting || !privyReady}
                    className="w-full h-12 text-base font-semibold gradient-blue"
                  >
                    {isConnecting ? (
                      <span className="flex items-center gap-2">
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Connecting...
                      </span>
                    ) : "Connect Wallet"}
                  </Button>
                </div>

              ) : transfer?.fundingStatus === "CONFIRMED" ? (
                // Success State
                <div className="text-center py-8">
                  <div className="relative w-24 h-24 mx-auto mb-6">
                    <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping" />
                    <div className="relative w-full h-full rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
                      <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold mb-2">Sent!</h3>
                  <p className="text-4xl font-black text-gradient-blue mb-4">${transfer.amount}</p>
                  <p className="text-sm text-muted-foreground mb-6">USDC sent successfully</p>
                  {transfer.fundingTxHash && (
                    <a
                      href={`https://basescan.org/tx/${transfer.fundingTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors mb-6"
                    >
                      View on BaseScan
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                  <Button
                    onClick={() => { setTransfer(null); setAccountNumber(""); setRoutingNumber(""); setAmount(""); setStep(1); }}
                    className="w-full h-12 text-base font-semibold gradient-blue"
                  >
                    Send More
                  </Button>
                </div>

              ) : (
                // Form States
                <form onSubmit={handleSubmit}>
                  {step === 1 && (
                    // Step 1: Amount
                    <div className="space-y-6">
                      <div className="text-center py-4">
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <span className="text-4xl font-bold text-muted-foreground">$</span>
                          <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0"
                            className="text-6xl font-black bg-transparent border-none outline-none text-center w-48 text-foreground placeholder:text-muted-foreground/30"
                            step="0.01"
                            min="0"
                          />
                        </div>
                        <p className="text-sm text-muted-foreground">USDC</p>
                      </div>

                      {/* Quick amounts */}
                      <div className="flex gap-2">
                        {[10, 50, 100, 500].map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setAmount(val.toString())}
                            className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all ${
                              amount === val.toString()
                                ? 'bg-blue-500 text-white'
                                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                            }`}
                          >
                            ${val}
                          </button>
                        ))}
                      </div>

                      <Button
                        type="button"
                        onClick={() => setStep(2)}
                        disabled={!canProceedToRecipient}
                        className="w-full h-12 text-base font-semibold gradient-blue disabled:opacity-50"
                      >
                        Continue
                      </Button>
                    </div>
                  )}

                  {step === 2 && (
                    // Step 2: Recipient
                    <div className="space-y-4">
                      <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back
                      </button>

                      <div className="p-4 rounded-2xl bg-muted/30 border border-border/50">
                        <p className="text-sm text-muted-foreground mb-1">Sending</p>
                        <p className="text-2xl font-bold">${amount} <span className="text-base font-normal text-muted-foreground">USDC</span></p>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="text-sm font-medium text-muted-foreground mb-2 block">Routing Number</label>
                          <input
                            type="text"
                            value={routingNumber}
                            onChange={(e) => setRoutingNumber(sanitizeDigits(e.target.value))}
                            placeholder="021000021"
                            maxLength={9}
                            className="w-full h-12 px-4 rounded-xl bg-muted/50 border border-border/50 text-foreground font-mono text-lg placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground mb-2 block">Account Number</label>
                          <input
                            type="text"
                            value={accountNumber}
                            onChange={(e) => setAccountNumber(sanitizeDigits(e.target.value))}
                            placeholder="1234567890"
                            className="w-full h-12 px-4 rounded-xl bg-muted/50 border border-border/50 text-foreground font-mono text-lg placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          />
                        </div>

                        {recipientEmail && (
                          <div className="flex items-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                            <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-sm text-green-400">Blue Wallet found: {recipientEmail}</span>
                          </div>
                        )}
                      </div>

                      <Button
                        type="button"
                        onClick={() => setStep(3)}
                        disabled={!canProceedToConfirm}
                        className="w-full h-12 text-base font-semibold gradient-blue disabled:opacity-50"
                      >
                        Review
                      </Button>
                    </div>
                  )}

                  {step === 3 && (
                    // Step 3: Confirm
                    <div className="space-y-4">
                      <button
                        type="button"
                        onClick={() => setStep(2)}
                        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back
                      </button>

                      <div className="p-5 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20">
                        <p className="text-sm text-muted-foreground mb-1">You&apos;re sending</p>
                        <p className="text-4xl font-black text-gradient-blue mb-4">${amount}</p>

                        <div className="space-y-2 pt-4 border-t border-border/30">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">To</span>
                            <span className="font-mono">****{accountNumber.slice(-4)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Routing</span>
                            <span className="font-mono">{routingNumber}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Network</span>
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-blue-500" />
                              Base
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Fee</span>
                            <span className="text-green-400">$0.00</span>
                          </div>
                        </div>
                      </div>

                      {error && (
                        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                          <p className="text-sm text-red-400 text-center">{error}</p>
                        </div>
                      )}

                      <Button
                        type="submit"
                        disabled={isDisabled}
                        className="w-full h-14 text-lg font-bold gradient-blue disabled:opacity-50"
                      >
                        {isSubmitting || isFunding ? (
                          <span className="flex items-center gap-2">
                            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            {isFunding ? "Confirming..." : "Processing..."}
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            Send ${amount}
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                          </span>
                        )}
                      </Button>

                      <p className="text-xs text-center text-muted-foreground">
                        By sending, you agree to our terms of service
                      </p>
                    </div>
                  )}
                </form>
              )}
            </div>

            {/* Footer */}
            {senderAddress && !transfer && (
              <div className="px-6 py-4 border-t border-border/50 bg-muted/20">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Connected: {senderAddress.slice(0, 6)}...{senderAddress.slice(-4)}</span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    Base Network
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom text */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          Powered by Base • Instant settlement • Zero fees
        </p>
      </div>
    </div>
  );
}
