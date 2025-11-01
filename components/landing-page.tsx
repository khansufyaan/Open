"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function LandingPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-16 px-6 py-16">
      {/* Hero Section */}
      <section className="rounded-3xl border border-slate-200/80 bg-white/70 p-12 text-center shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70">
        <div className="mx-auto max-w-4xl space-y-8">
          {/* Logo */}
          <div className="flex justify-center">
            <div className="relative h-32 w-32">
              <Image
                src="/blue-logo.svg"
                alt="BLUE"
                fill
                className="object-contain"
                priority
              />
            </div>
          </div>

          {/* Main Heading */}
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-5xl md:text-6xl">
            Non-custodial, KYC-compliant private wallet for bank customers
          </h1>

          {/* Sub-heading */}
          <p className="text-xl leading-8 text-slate-600 dark:text-slate-300 sm:text-2xl">
            Move stablecoins using bank accounts — without exposing your wallet.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col items-center justify-center gap-4 pt-6 sm:flex-row">
            <Button size="lg" asChild className="min-w-[200px]">
              <Link href="/send">
                Send Money
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="min-w-[200px]">
              <Link href="/recipient">
                Receive Money
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Feature Preview Section */}
      <section className="rounded-3xl border border-slate-200/80 bg-white/70 p-8 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70">
        <div className="mx-auto max-w-4xl">
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900">
            <div className="flex h-full items-center justify-center">
              <div className="text-center text-slate-400 dark:text-slate-500">
                <svg
                  className="mx-auto h-24 w-24 mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <p className="text-sm font-medium">Feature Preview</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-6 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Non-Custodial
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              You maintain full control of your funds. We never hold your assets.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-6 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              KYC-Compliant
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Secure identity verification through your existing bank account.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-6 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Privacy First
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Transfer stablecoins without exposing your wallet address.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
