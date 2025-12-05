"use client";

import Link from "next/link";
import Image from "next/image";
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
                  Send USDC
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="default" asChild className="min-w-[180px]">
                <Link href="/recipient">
                  Receive USDC
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>

            {/* Bank Logos */}
            <div className="flex items-center justify-center gap-8 pt-2 sm:gap-12">
              {/* Bank of America */}
              <div className="flex flex-col items-center">
                <div className="rounded-xl bg-white p-3 dark:bg-slate-800">
                  <Image src="/BOFA.png" alt="Bank of America" width={80} height={80} className="h-20 w-20 object-contain" />
                </div>
              </div>

              {/* Chase */}
              <div className="flex flex-col items-center">
                <div className="rounded-xl bg-white p-3 dark:bg-slate-800">
                  <Image src="/Chase.png" alt="Chase" width={80} height={80} className="h-20 w-20 object-contain" />
                </div>
              </div>

              {/* Wells Fargo */}
              <div className="flex flex-col items-center">
                <div className="rounded-xl bg-white p-3 dark:bg-slate-800">
                  <Image src="/Wells.png" alt="Wells Fargo" width={80} height={80} className="h-20 w-20 object-contain" />
                </div>
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
