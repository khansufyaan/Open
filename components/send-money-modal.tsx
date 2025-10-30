"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SendMoneyModalProps {
  transferId: string;
  walletAddress: string;
  usdcBalance: string; // in USDC (e.g., "1234.56")
  onSend: (destination: string, amount: string) => Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
}

const HEX_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export function SendMoneyModal({
  transferId,
  walletAddress,
  usdcBalance,
  onSend,
  onCancel,
  isLoading = false,
}: SendMoneyModalProps) {
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const balance = parseFloat(usdcBalance) || 0;
  const enteredAmount = parseFloat(amount) || 0;
  const isValidAddress = HEX_ADDRESS_REGEX.test(destination.trim());
  const isValidAmount = enteredAmount > 0 && enteredAmount <= balance;
  const canSend = isValidAddress && isValidAmount && !isLoading;

  const handleMaxClick = () => {
    setAmount(balance.toString());
    setError(null);
  };

  const handleAmountChange = (value: string) => {
    // Only allow numbers and one decimal point
    const sanitized = value.replace(/[^\d.]/g, "");
    const parts = sanitized.split(".");
    if (parts.length > 2) return; // Prevent multiple decimals

    setAmount(sanitized);
    setError(null);

    const num = parseFloat(sanitized);
    if (num > balance) {
      setError(`Insufficient balance. You have ${balance.toFixed(2)} USDC`);
    }
  };

  const handleDestinationChange = (value: string) => {
    setDestination(value);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canSend) return;

    setError(null);
    setIsValidating(true);

    try {
      await onSend(destination.trim(), amount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send transaction");
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Send USDC
          </h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Network: Base • From: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Balance Display */}
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
            <p className="text-xs text-slate-500 dark:text-slate-400">Available Balance</p>
            <p className="text-xl font-semibold text-slate-900 dark:text-white">
              {balance.toFixed(2)} USDC
            </p>
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <Label htmlFor={`amount-${transferId}`}>Amount</Label>
            <div className="flex gap-2">
              <Input
                id={`amount-${transferId}`}
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                className="flex-1"
                disabled={isLoading}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleMaxClick}
                disabled={isLoading}
              >
                Max
              </Button>
            </div>
          </div>

          {/* Destination Address Input */}
          <div className="space-y-2">
            <Label htmlFor={`destination-${transferId}`}>To Address</Label>
            <Input
              id={`destination-${transferId}`}
              type="text"
              placeholder="0x..."
              value={destination}
              onChange={(e) => handleDestinationChange(e.target.value)}
              disabled={isLoading}
            />
            {destination && !isValidAddress && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Enter a valid Base wallet address (0x...)
              </p>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isLoading}
                className="flex-1"
              >
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              disabled={!canSend || isValidating}
              className="flex-1"
            >
              {isLoading || isValidating ? "Sending..." : "Send"}
            </Button>
          </div>

          {/* Gas Fee Info */}
          <p className="text-xs text-center text-slate-500 dark:text-slate-400">
            Gas fees will be estimated before sending
          </p>
        </form>
      </div>
    </div>
  );
}
