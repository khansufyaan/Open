"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { ExternalLink, Copy, LogOut, Wallet } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function WalletButton() {
  const { ready: privyReady, authenticated, logout } = usePrivy();
  const { wallets } = useWallets();
  const [copied, setCopied] = useState(false);

  const evmWallet = wallets.find((wallet) => wallet.walletClientType === "privy" || wallet.type === "ethereum");
  const address = evmWallet?.address;

  const handleCopy = async () => {
    if (address) {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleViewOnBasescan = () => {
    if (address) {
      window.open(`https://basescan.org/address/${address}`, "_blank");
    }
  };

  const handleDisconnect = async () => {
    await logout();
  };

  if (!privyReady || !authenticated || !address) {
    return null;
  }

  const truncatedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" className="gap-2">
          <Wallet className="h-4 w-4" />
          {truncatedAddress}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5">
          <p className="text-xs font-semibold text-muted-foreground">Connected Wallet</p>
          <p className="text-sm font-mono mt-1">{truncatedAddress}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCopy} className="cursor-pointer">
          <Copy className="mr-2 h-4 w-4" />
          {copied ? "Copied!" : "Copy Address"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleViewOnBasescan} className="cursor-pointer">
          <ExternalLink className="mr-2 h-4 w-4" />
          View on Basescan
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleDisconnect} className="cursor-pointer text-red-600 dark:text-red-400">
          <LogOut className="mr-2 h-4 w-4" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
