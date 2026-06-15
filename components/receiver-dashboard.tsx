"use client";

import { useCallback, useState } from "react";
import type { Session } from "@/types/session";
import { Button } from "@/components/ui/button";
import type { PlaidAchAccount, TransferSummary } from "@/types/receiver";
import { CheckCircle2 } from "lucide-react";

interface ReceiverDashboardProps {
  session: Session;
  linkedAccounts: PlaidAchAccount[];
  transferSummaries: TransferSummary[];
  isTransfersLoading: boolean;
  onRefreshTransfers: () => Promise<void>;
  onWithdraw: (transfer: TransferSummary) => Promise<void>;
  withdrawInputs: Record<string, string>;
  onWithdrawInputChange: (transferId: string, value: string) => void;
  withdrawLoading: Record<string, boolean>;
  withdrawErrors: Record<string, string | null>;
  withdrawSuccess: Record<string, string | null>;
  onDisconnectPlaid?: () => Promise<void>;
}

function getInitials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) {
    const diffMins = Math.floor(diffMs / (1000 * 60));
    return diffMins <= 1 ? "Just now" : `${diffMins} minutes ago`;
  }
  if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }
  return date.toLocaleDateString();
}

export function ReceiverDashboard({
  linkedAccounts,
  transferSummaries,
  isTransfersLoading,
  onRefreshTransfers,
  onWithdraw,
  withdrawInputs,
  onWithdrawInputChange,
  withdrawLoading,
  withdrawErrors,
  withdrawSuccess,
  onDisconnectPlaid,
}: ReceiverDashboardProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Funds sit in the vault until withdrawn. A Bridge transfer obscures the
  // originating (vault) address on-chain, so recipients withdraw directly to
  // an external address — there is no intermediate "claim" step.
  const withdrawable = transferSummaries.filter((t) => t.status === "DEPOSITED");
  const history = transferSummaries.filter((t) => t.status === "WITHDRAWN");

  const balance = withdrawable.reduce((sum, t) => sum + parseFloat(t.amount || "0"), 0);

  const connectedBank = linkedAccounts[0];

  const handleWithdraw = useCallback(
    async (transfer: TransferSummary) => {
      await onWithdraw(transfer);
      await onRefreshTransfers();
    },
    [onWithdraw, onRefreshTransfers]
  );

  const handleDisconnectPlaid = useCallback(async () => {
    if (!onDisconnectPlaid) return;

    setIsDisconnecting(true);
    try {
      await onDisconnectPlaid();
    } catch (error) {
      console.error("Failed to disconnect Plaid:", error);
    } finally {
      setIsDisconnecting(false);
    }
  }, [onDisconnectPlaid]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      {/* Blue Wallet Balance Card */}
      <div className="rounded-3xl bg-gradient-to-br from-blue-500 to-blue-600 p-8 text-white shadow-lg">
        <h2 className="text-lg font-medium opacity-90">Available to Withdraw</h2>
        <p className="mt-2 text-5xl font-bold tracking-tight">${balance.toFixed(2)}</p>
        <div className="mt-6 flex gap-3">
          <Button
            variant="secondary"
            className="bg-white/20 hover:bg-white/30 text-white border-0"
            onClick={() => setShowHistory(false)}
          >
            Withdraw
          </Button>
          <Button
            variant="secondary"
            className="bg-white/20 hover:bg-white/30 text-white border-0"
            onClick={() => setShowHistory((value) => !value)}
          >
            History
          </Button>
        </div>
      </div>

      {/* Withdraw view */}
      {!showHistory && (
        <div className="space-y-4">
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Withdraw funds</h3>
          {isTransfersLoading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading transfers...</p>
          ) : withdrawable.length === 0 ? (
            <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-8 text-center text-slate-500 dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-400">
              No funds available to withdraw yet
            </div>
          ) : (
            <div className="space-y-3">
              {withdrawable.map((transfer) => {
                const senderName = transfer.recipientWalletName || "Incoming transfer";
                const initials = getInitials(senderName);

                return (
                  <div
                    key={transfer.transferId}
                    className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm dark:border-slate-800/60 dark:bg-slate-900/70"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 text-lg font-bold text-white">
                        {initials}
                      </div>

                      <div className="flex-1 min-w-0 space-y-3">
                        <div>
                          <p className="text-2xl font-bold text-slate-900 dark:text-white">
                            ${parseFloat(transfer.amount).toFixed(2)}
                          </p>
                          <p className="text-sm text-slate-600 dark:text-slate-300">{senderName}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">
                            Received {formatTimeAgo(transfer.createdAt)}
                          </p>
                        </div>

                        {/* Withdraw input */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            Destination wallet address
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="0x..."
                              value={withdrawInputs[transfer.transferId] || ""}
                              onChange={(e) =>
                                onWithdrawInputChange(transfer.transferId, e.target.value)
                              }
                              disabled={withdrawLoading[transfer.transferId]}
                              className="flex-1 h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <Button
                              onClick={() => handleWithdraw(transfer)}
                              disabled={
                                withdrawLoading[transfer.transferId] ||
                                !withdrawInputs[transfer.transferId]?.trim()
                              }
                              className="h-10 bg-blue-600 hover:bg-blue-700 font-semibold px-6"
                            >
                              {withdrawLoading[transfer.transferId] ? "Withdrawing..." : "Withdraw"}
                            </Button>
                          </div>
                          {withdrawErrors[transfer.transferId] && (
                            <p className="text-xs text-red-600 dark:text-red-400">
                              {withdrawErrors[transfer.transferId]}
                            </p>
                          )}
                          {withdrawSuccess[transfer.transferId] ? (
                            <div className="space-y-1">
                              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                                Withdrawal submitted!
                              </p>
                              <a
                                href={`https://basescan.org/tx/${withdrawSuccess[transfer.transferId]}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline dark:text-blue-400 block truncate"
                              >
                                View tx: {withdrawSuccess[transfer.transferId]}
                              </a>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* History view */}
      {showHistory && (
        <div className="space-y-4">
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Transfer History</h3>
          {history.length === 0 ? (
            <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-8 text-center text-slate-500 dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-400">
              No transfer history
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((transfer) => {
                const senderName = transfer.recipientWalletName || "Incoming transfer";
                const initials = getInitials(senderName);

                return (
                  <div
                    key={transfer.transferId}
                    className="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm dark:border-slate-800/60 dark:bg-slate-900/70"
                  >
                    <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-400 to-slate-600 text-lg font-bold text-white">
                      {initials}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-2xl font-bold text-slate-900 dark:text-white">
                          ${parseFloat(transfer.amount).toFixed(2)}
                        </p>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          Withdrawn
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                        From: {senderName}
                      </p>
                      {transfer.withdrawalTargetAddress && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          To: {transfer.withdrawalTargetAddress}
                        </p>
                      )}
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                        Withdrawn {formatTimeAgo(transfer.withdrawnAt || transfer.createdAt)}
                      </p>
                      {transfer.withdrawalTxHash && (
                        <a
                          href={`https://basescan.org/tx/${transfer.withdrawalTxHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 text-xs text-blue-600 hover:underline dark:text-blue-400 block truncate"
                        >
                          📤 Withdraw: {transfer.withdrawalTxHash}
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Connected Bank */}
      {connectedBank && (
        <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-6 dark:border-slate-800/60 dark:bg-slate-900/70">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Connected Bank
            </h3>
            <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              Verified
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
              <span className="text-2xl">🏦</span>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-slate-900 dark:text-white">
                {connectedBank.name || "Bank Account"}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Checking ••••{connectedBank.mask || connectedBank.accountNumber.slice(-4)}
              </p>
            </div>
            {onDisconnectPlaid && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnectPlaid}
                disabled={isDisconnecting}
                className="text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950"
              >
                {isDisconnecting ? "Disconnecting..." : "Disconnect"}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
