"use client";

import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { WalletButton } from "@/components/wallet-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Navbar({ className }: { className?: string }) {
  return (
    <div className={cn("flex justify-center px-6 pt-6", className)}>
      <nav className="grid w-full max-w-5xl grid-cols-3 items-center gap-4 rounded-full border border-slate-200/70 bg-white/85 px-6 py-3 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/85">
        <Link
          href="/"
          className="text-sm font-semibold tracking-[0.3em] text-slate-800 transition hover:text-slate-600 dark:text-slate-100 dark:hover:text-slate-300"
        >
          BLUE WALLET
        </Link>
        <div className="flex items-center justify-center gap-3">
          <Button variant="secondary" size="sm" asChild>
            <Link href="/">Sender</Link>
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <Link href="/recipient">Receiver</Link>
          </Button>
        </div>
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/contact">Contact</Link>
          </Button>
          <WalletButton />
          <ThemeToggle />
        </div>
      </nav>
    </div>
  );
}
