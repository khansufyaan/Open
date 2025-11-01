"use client";

import { useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { PlaidConnectButton } from "@/components/plaid-connect-button";
import { SendMoneyModal } from "@/components/send-money-modal";
import type { PlaidAchAccount, PlaidIdentitySnapshot, TransferSummary } from "@/types/receiver";

interface ReceiverFlowModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: { userId: string };
  plaidIdentity: PlaidIdentitySnapshot | null;
  transferSummaries: TransferSummary[];
  isTransfersLoading: boolean;
  userWalletInfo: { walletId?: string; walletAddress?: string } | null;
  onPlaidSuccess: (identity: PlaidIdentitySnapshot) => Promise<void>;
  onPlaidError: (error: string) => void;
  onClaim: (summary: TransferSummary) => Promise<void>;
  onWithdraw: (summary: TransferSummary) => Promise<void>;
  claimLoading: Record<string, boolean>;
  claimErrors: Record<string, string | null>;
  claimSuccess: Record<string, string | null>;
  linkedAccounts: PlaidAchAccount[];
  selectedAccount: PlaidAchAccount | null;
}

export function ReceiverFlowModal({
  open,
  onOpenChange,
  session,
  plaidIdentity,
  transferSummaries,
  isTransfersLoading,
  userWalletInfo,
  onPlaidSuccess,
  onPlaidError,
  onClaim,
  onWithdraw,
  claimLoading,
  claimErrors,
  claimSuccess,
  linkedAccounts,
  selectedAccount,
}: ReceiverFlowModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedTransferForWithdraw, setSelectedTransferForWithdraw] = useState<TransferSummary | null>(null);

  const depositedTransfers = transferSummaries.filter(t => t.status === "DEPOSITED");
  const claimedTransfers = transferSummaries.filter(t => t.status === "CLAIMED");

  const steps = [
    {
      id: "identity",
      title: "Identity Verified",
      canProceed: true,
    },
    {
      id: "bank",
      title: "Link Bank Account",
      canProceed: !!plaidIdentity,
    },
    {
      id: "claim",
      title: "Claim Funds",
      canProceed: depositedTransfers.length === 0 || claimedTransfers.length > 0,
    },
    {
      id: "withdraw",
      title: "Withdraw",
      canProceed: true,
    },
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const renderIdentityStep = () => (
    <CardContent className="px-8 pb-8 space-y-4">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            You&apos;re signed in securely
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200/70 bg-slate-50/50 p-4 space-y-3 dark:border-slate-700/50 dark:bg-slate-800/50">
        <div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">User ID</p>
          <p className="text-sm font-mono text-slate-900 dark:text-white break-all">
            {session.userId}
          </p>
        </div>

        {(userWalletInfo?.walletAddress || transferSummaries.length > 0) && (
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Wallet Address</p>
            <p className="text-sm font-mono text-slate-900 dark:text-white break-all">
              {userWalletInfo?.walletAddress || transferSummaries[0]?.walletAddress || "Not provisioned yet"}
            </p>
          </div>
        )}

        {plaidIdentity && (
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Bank Status</p>
            <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Verified
            </p>
          </div>
        )}
      </div>
    </CardContent>
  );

  const renderBankStep = () => (
    <CardContent className="px-8 pb-8 space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Connect your bank account to verify your identity and receive transfers.
      </p>

      {plaidIdentity ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> Bank Account Verified
          </div>

          <div className="rounded-lg border border-slate-200/70 bg-slate-50/50 p-4 space-y-3 dark:border-slate-700/50 dark:bg-slate-800/50">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Full Name</p>
              <p className="text-sm text-slate-900 dark:text-white">
                {plaidIdentity.names[0] ?? "Not provided"}
              </p>
            </div>

            {plaidIdentity.emails[0] && (
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Email</p>
                <p className="text-sm text-slate-900 dark:text-white">
                  {plaidIdentity.emails[0]}
                </p>
              </div>
            )}

            {selectedAccount && (
              <>
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Routing Number</p>
                  <p className="text-sm font-mono text-slate-900 dark:text-white">
                    {selectedAccount.routingNumber}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Account Number</p>
                  <p className="text-sm font-mono text-slate-900 dark:text-white">
                    {selectedAccount.accountNumber}
                  </p>
                </div>
              </>
            )}
          </div>

          <PlaidConnectButton
            userId={session.userId}
            label="Link another bank account"
            onSuccess={onPlaidSuccess}
            onError={onPlaidError}
          />
        </div>
      ) : (
        <PlaidConnectButton
          userId={session.userId}
          label="Connect Bank Account"
          onSuccess={onPlaidSuccess}
          onError={onPlaidError}
        />
      )}
    </CardContent>
  );

  const renderClaimStep = () => (
    <CardContent className="px-8 pb-8 space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Move funds from the company vault to your managed wallet.
      </p>

      {isTransfersLoading ? (
        <p className="text-sm text-slate-500">Loading transfers...</p>
      ) : depositedTransfers.length === 0 ? (
        <p className="text-sm text-slate-500">No funds available to claim.</p>
      ) : (
        <div className="space-y-3">
          {depositedTransfers.map((summary) => (
            <div
              key={summary.transferId}
              className="rounded-lg border border-slate-200/70 bg-slate-50/50 p-4 space-y-2 dark:border-slate-700/50 dark:bg-slate-800/50"
            >
              <p className="font-medium text-slate-900 dark:text-white">
                {summary.amount} USDC
              </p>
              <p className="text-xs text-slate-500">Transfer {summary.transferId}</p>

              {claimSuccess[summary.transferId] ? (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  ✓ Claimed successfully
                </p>
              ) : (
                <>
                  <Button
                    onClick={() => onClaim(summary)}
                    disabled={claimLoading[summary.transferId]}
                    className="w-full"
                    size="sm"
                  >
                    {claimLoading[summary.transferId] ? "Claiming..." : "Claim"}
                  </Button>
                  {claimErrors[summary.transferId] && (
                    <p className="text-xs text-red-600 dark:text-red-400">
                      {claimErrors[summary.transferId]}
                    </p>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </CardContent>
  );

  const renderWithdrawStep = () => (
    <CardContent className="px-8 pb-8 space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Transfer your claimed funds to any external Base wallet address.
      </p>

      {isTransfersLoading ? (
        <p className="text-sm text-slate-500">Loading transfers...</p>
      ) : claimedTransfers.length === 0 ? (
        <p className="text-sm text-slate-500">No funds available to withdraw.</p>
      ) : (
        <div className="space-y-3">
          {claimedTransfers.map((summary) => (
            <div
              key={summary.transferId}
              className="rounded-lg border border-slate-200/70 bg-slate-50/50 p-4 space-y-2 dark:border-slate-700/50 dark:bg-slate-800/50"
            >
              <p className="font-medium text-slate-900 dark:text-white">
                {summary.amount} USDC
              </p>
              <p className="text-xs text-slate-500">Transfer {summary.transferId}</p>

              <Button
                onClick={() => setSelectedTransferForWithdraw(summary)}
                className="w-full"
                size="sm"
              >
                Withdraw
              </Button>
            </div>
          ))}
        </div>
      )}

      {selectedTransferForWithdraw && (
        <SendMoneyModal
          transferId={selectedTransferForWithdraw.transferId}
          walletAddress={selectedTransferForWithdraw.walletAddress!}
          usdcBalance={selectedTransferForWithdraw.amount}
          onSend={async () => {
            await onWithdraw(selectedTransferForWithdraw);
            setSelectedTransferForWithdraw(null);
          }}
          onCancel={() => setSelectedTransferForWithdraw(null)}
          isLoading={false}
        />
      )}
    </CardContent>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 0:
        return renderIdentityStep();
      case 1:
        return renderBankStep();
      case 2:
        return renderClaimStep();
      case 3:
        return renderWithdrawStep();
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0">
        <DialogTitle className="sr-only">Manage Your Transfers</DialogTitle>
        <Card className="border-0 shadow-none">
          <CardHeader className="space-y-4 text-center pb-6">
            <div className="flex justify-center">
              <div className="h-20 w-20 rounded-2xl bg-blue-600 flex items-center justify-center">
                <span className="text-4xl font-bold text-white">B</span>
              </div>
            </div>
            <div className="space-y-2">
              <CardTitle className="text-3xl font-bold">Blue Wallets</CardTitle>
              <CardDescription className="text-base text-slate-500">
                Receive USDC Instantly
              </CardDescription>
            </div>
            <div className="space-y-2 pt-2">
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
                {steps[currentStep].title}
              </h2>
            </div>
          </CardHeader>

          {renderCurrentStep()}

          <div className="px-8 pb-8 flex items-center justify-between">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 0}
              className="gap-2"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
            <div className="text-sm text-slate-500">
              {currentStep + 1} of {steps.length}
            </div>
            <Button
              onClick={handleNext}
              disabled={currentStep === steps.length - 1}
              className="gap-2"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
