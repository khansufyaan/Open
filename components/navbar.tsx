"use client";

import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Navbar({ className }: { className?: string }) {
  return (
    <div className={cn("flex justify-center px-6", className)}>
      <nav className="mt-6 flex w-full max-w-5xl items-center justify-between rounded-full border border-slate-200/70 bg-white/85 px-6 py-3 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/85">
        <Link
          href="#top"
          className="text-sm font-semibold tracking-[0.3em] text-slate-800 transition hover:text-slate-600 dark:text-slate-100 dark:hover:text-slate-300"
        >
          Blue Wallet
        </Link>
        <Button variant="secondary" size="sm" asChild>
          <Link href="/contact">Contact</Link>
        </Button>
        <ThemeToggle />
      </nav>
    </div>
  );
}
