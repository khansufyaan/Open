"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function LandingPage() {
  return (
    <div className="flex min-h-[calc(100vh-200px)] items-center justify-center px-6 py-8">
      <div className="mx-auto w-full max-w-5xl">
        {/* Hero Section */}
        <section className="rounded-3xl border border-slate-200/80 bg-white/70 p-8 text-center shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70">
          <div className="mx-auto max-w-4xl space-y-6">
            {/* Main Heading */}
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl md:text-4xl">
              Move stablecoins using bank accounts
            </h1>

            {/* CTA Buttons */}
            <div className="flex flex-col items-center justify-center gap-3 pt-4 sm:flex-row">
              <Button size="default" asChild className="min-w-[180px]">
                <Link href="/send">
                  Send Money
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="default" asChild className="min-w-[180px]">
                <Link href="/recipient">
                  Receive Money
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>

            {/* Flow Diagram - Moved below CTA buttons */}
            <div className="flex items-center justify-center gap-4 pt-2 sm:gap-8">
              {/* Wallet 1 */}
              <div className="flex flex-col items-center gap-2">
                <div className="rounded-lg bg-slate-100 p-3 dark:bg-slate-800">
                  <svg className="h-8 w-8 text-slate-700 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Wallet</span>
              </div>

              {/* Arrow */}
              <ArrowRight className="h-6 w-6 text-slate-400" />

              {/* KYC */}
              <div className="flex flex-col items-center gap-2">
                <div className="rounded-lg bg-blue-100 p-3 dark:bg-blue-900">
                  <svg className="h-8 w-8 text-blue-700 dark:text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">KYC</span>
              </div>

              {/* Arrow */}
              <ArrowRight className="h-6 w-6 text-slate-400" />

              {/* Wallet 2 */}
              <div className="flex flex-col items-center gap-2">
                <div className="rounded-lg bg-slate-100 p-3 dark:bg-slate-800">
                  <svg className="h-8 w-8 text-slate-700 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Wallet</span>
              </div>
            </div>

            {/* Features Grid - Compact */}
            <div className="grid gap-4 pt-4 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200/80 bg-white/60 p-4 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/60">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Non-Custodial
                </h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  Full control of your funds.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-white/60 p-4 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/60">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  KYC-Compliant
                </h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  Bank-verified identity.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-white/60 p-4 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/60">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Privacy First
                </h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  Protected wallet address.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
