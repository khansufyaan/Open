"use client";

import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "#vision", label: "Vision" },
  { href: "#trust", label: "Trust" },
  { href: "#docs", label: "Docs" },
];

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
        <div className="flex items-center gap-2">
          {navItems.map((item) => (
            <Button key={item.href} variant="ghost" size="sm" asChild>
              <Link href={item.href}>{item.label}</Link>
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" asChild>
            <Link href="mailto:hello@bluewallet.xyz">Reach out</Link>
          </Button>
          <ThemeToggle />
        </div>
      </nav>
    </div>
  );
}
