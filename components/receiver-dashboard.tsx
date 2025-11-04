"use client";

import { useCallback, useState } from "react";
import type { Session } from "@turnkey/sdk-types";
import { Button } from "@/components/ui/button";
import type { PlaidAchAccount, TransferSummary } from "@/types/receiver";
import { CheckCircle2 } from "lucide-react";

interface ReceiverDashboardProps {
  session: Session;
  linkedAccounts: PlaidAchAccount[];
  transferSummaries: TransferSummary[];
  isTransfersLoading: boolean;
  onClaim: (transfer: TransferSummary) => Promise<void>;
  claimLoading: Record<string, boolean>;
  claimErrors: Record<string, string | null>;
  claimSuccess: Record<string, string | null>;
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
  onClaim,
  claimLoading,
  claimErrors,
  claimSuccess,
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
  const [showTransferOut, setShowTransferOut] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Calculate total balance from claimed transfers
  const balance = transferSummaries
    .filter((t) => t.status === "CLAIMED")
    .reduce((sum, t) => sum + parseFloat(t.amount || "0"), 0);

  // Get pending (deposited) transfers
  const pendingClaims = transferSummaries.filter((t) => t.status === "DEPOSITED");

  // Get claimed transfers ready for withdrawal
  const claimedTransfers = transferSummaries.filter((t) => t.status === "CLAIMED");

  // Get all completed transfers for history (claimed + withdrawn)
  const completedTransfers = transferSummaries.filter(
    (t) => t.status === "CLAIMED" || t.status === "WITHDRAWN"
  );

  const connectedBank = linkedAccounts[0];

  const handleClaim = useCallback(
    async (transfer: TransferSummary) => {
      await onClaim(transfer);
      await onRefreshTransfers();
    },
    [onClaim, onRefreshTransfers]
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
        <h2 className="text-lg font-medium opacity-90">Blue Wallet Balance</h2>
        <p className="mt-2 text-5xl font-bold tracking-tight">
          ${balance.toFixed(2)}
        </p>
        <div className="mt-6 flex gap-3">
          <Button
            variant="secondary"
            className="bg-white/20 hover:bg-white/30 text-white border-0"
            disabled={!connectedBank || balance === 0}
            onClick={() => {
              setShowTransferOut(!showTransferOut);
              setShowHistory(false);
            }}
          >
            Transfer Out
          </Button>
          <Button
            variant="secondary"
            className="bg-white/20 hover:bg-white/30 text-white border-0"
            onClick={() => {
              setShowHistory(!showHistory);
              setShowTransferOut(false);
            }}
          >
            History
          </Button>
        </div>
      </div>

      {/* Transfer Out Section */}
      {showTransferOut && (
        <div className="space-y-4">
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
            Transfer Out
          </h3>
          {isTransfersLoading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading transfers...</p>
          ) : claimedTransfers.length === 0 ? (
            <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-8 text-center text-slate-500 dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-400">
              No claimed funds available for withdrawal
            </div>
          ) : (
            <div className="space-y-3">
              {claimedTransfers.map((transfer) => {
                const senderName = transfer.recipientWalletName || "Unknown Sender";
                const initials = getInitials(senderName);

                return (
                  <div
                    key={transfer.transferId}
                    className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm dark:border-slate-800/60 dark:bg-slate-900/70"
                  >
                    <div className="flex items-start gap-4">
                      {/* Avatar */}
                      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 text-lg font-bold text-white">
                        {initials}
                      </div>

                      {/* Info and Withdraw Form */}
                      <div className="flex-1 min-w-0 space-y-3">
                        <div>
                          <p className="text-2xl font-bold text-slate-900 dark:text-white">
                            ${parseFloat(transfer.amount).toFixed(2)}
                          </p>
                          <p className="text-sm text-slate-600 dark:text-slate-300">
                            {senderName}
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">
                            Claimed {formatTimeAgo(transfer.createdAt)}
                          </p>
                        </div>

                        {/* Withdraw Input */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            Wallet Address
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="0x..."
                              value={withdrawInputs[transfer.transferId] || ""}
                              onChange={(e) => onWithdrawInputChange(transfer.transferId, e.target.value)}
                              disabled={withdrawLoading[transfer.transferId]}
                              className="flex-1 h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <Button
                              onClick={() => onWithdraw(transfer)}
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
                          {withdrawSuccess[transfer.transferId] && (
                            <div className="space-y-1">
                              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                                Withdrawn successfully!
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
                          )}
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

      {/* Pending Claims */}
      {!showHistory && !showTransferOut && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
              Pending Claims
            </h3>
            {pendingClaims.length > 0 && (
              <span className="rounded-full bg-red-500 px-3 py-1 text-sm font-semibold text-white">
                {pendingClaims.length} NEW
              </span>
            )}
          </div>

          {isTransfersLoading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading claims...</p>
          ) : pendingClaims.length === 0 ? (
            <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-8 text-center text-slate-500 dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-400">
              No pending claims
            </div>
          ) : (
            <div className="space-y-3">
              {pendingClaims.map((transfer) => {
                const senderName = transfer.recipientWalletName || "Unknown Sender";
                const initials = getInitials(senderName);
                const bankInfo = linkedAccounts.find(
                  (acc) => acc.accountNumber === transfer.walletId
                );
                const accountMask = bankInfo?.mask || "****";

                return (
                  <div
                    key={transfer.transferId}
                    className="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm dark:border-slate-800/60 dark:bg-slate-900/70"
                  >
                    {/* Avatar */}
                    <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 text-lg font-bold text-white">
                      {initials}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">
                        ${parseFloat(transfer.amount).toFixed(2)}
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-300 truncate">
                        {senderName} • {bankInfo?.name || "Bank"} ****{accountMask}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {formatTimeAgo(transfer.createdAt)}
                      </p>
                      {claimErrors[transfer.transferId] && (
                        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                          {claimErrors[transfer.transferId]}
                        </p>
                      )}
                      {claimSuccess[transfer.transferId] && (
                        <div className="mt-1 space-y-1">
                          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                            Claimed successfully!
                          </p>
                          <a
                            href={`https://basescan.org/tx/${claimSuccess[transfer.transferId]}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline dark:text-blue-400 block truncate"
                          >
                            View tx: {claimSuccess[transfer.transferId]}
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Claim Button */}
                    <Button
                      onClick={() => handleClaim(transfer)}
                      disabled={claimLoading[transfer.transferId]}
                      className="h-12 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-8"
                    >
                      {claimLoading[transfer.transferId] ? "Claiming..." : "Claim"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* History View */}
      {showHistory && (
        <div className="space-y-4">
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
            Transfer History
          </h3>
          {completedTransfers.length === 0 ? (
            <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-8 text-center text-slate-500 dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-400">
              No transfer history
            </div>
          ) : (
            <div className="space-y-3">
              {completedTransfers.map((transfer) => {
                const senderName = transfer.recipientWalletName || "Unknown Sender";
                const initials = getInitials(senderName);

                return (
                  <div
                    key={transfer.transferId}
                    className="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm dark:border-slate-800/60 dark:bg-slate-900/70"
                  >
                    {/* Avatar */}
                    <div className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-lg font-bold text-white ${
                      transfer.status === "WITHDRAWN"
                        ? "from-slate-400 to-slate-600"
                        : "from-blue-400 to-blue-600"
                    }`}>
                      {initials}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-2xl font-bold text-slate-900 dark:text-white">
                          ${parseFloat(transfer.amount).toFixed(2)}
                        </p>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          transfer.status === "WITHDRAWN"
                            ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                        }`}>
                          {transfer.status === "WITHDRAWN" ? "Withdrawn" : "Claimed"}
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
                        {transfer.status === "WITHDRAWN"
                          ? `Withdrawn ${formatTimeAgo(transfer.withdrawnAt || transfer.createdAt)}`
                          : `Claimed ${formatTimeAgo(transfer.claimedAt || transfer.createdAt)}`
                        }
                      </p>
                      <div className="mt-2 space-y-1">
                        {transfer.claimTxHash && (
                          <a
                            href={`https://basescan.org/tx/${transfer.claimTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline dark:text-blue-400 block truncate"
                          >
                            📥 Claim: {transfer.claimTxHash}
                          </a>
                        )}
                        {transfer.withdrawalTxHash && (
                          <a
                            href={`https://basescan.org/tx/${transfer.withdrawalTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline dark:text-blue-400 block truncate"
                          >
                            📤 Withdraw: {transfer.withdrawalTxHash}
                          </a>
                        )}
                      </div>
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
