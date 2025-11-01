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
            {/* Logo */}
            <div className="flex justify-center">
              <div className="relative h-20 w-20">
                <Image
                  src="/blue2.jpg"
                  alt="BLUE"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
            </div>

            {/* Main Heading */}
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl md:text-4xl">
              Non-custodial, KYC-compliant private wallet for bank customers
            </h1>

            {/* Sub-heading */}
            <p className="text-base leading-7 text-slate-600 dark:text-slate-300 sm:text-lg">
              Move stablecoins using bank accounts — without exposing your wallet.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col items-center justify-center gap-3 pt-4 sm:flex-row">
              <Button size="default" asChild className="min-w-[180px]">
                <Link href="/send">
                  Send Money
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="default" variant="outline" asChild className="min-w-[180px]">
                <Link href="/recipient">
                  Receive Money
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>

            {/* Features Grid - Compact */}
            <div className="grid gap-4 pt-6 sm:grid-cols-3">
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
