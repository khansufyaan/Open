"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

export function LandingPage() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Background — neutral base, drifting aurora mesh, soft ambient top-light */}
      <div className="absolute inset-0 bg-background" />
      <div className="aurora pointer-events-none absolute inset-x-0 top-0 h-[760px] opacity-70" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[620px] bg-[radial-gradient(60%_100%_at_50%_0%,oklch(0.42_0.05_256/0.18),transparent_72%)]" />

      <div className="relative z-10">
        {/* Hero Section */}
        <section
          className={`flex min-h-[85vh] flex-col items-center justify-center px-6 py-12 transition-all duration-1000 ${
            isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}
        >
          <div className="w-full max-w-5xl">
            {/* Headline */}
            <div className="mb-6 text-center">
              <h1 className="text-4xl font-semibold leading-[1.05] tracking-[-0.02em] sm:text-5xl md:text-6xl lg:text-7xl">
                <span className="block text-foreground">The first crypto wallet</span>
                <span className="mt-2 block text-gradient-blue">linked to your bank.</span>
              </h1>
            </div>

            {/* Subhead */}
            <p className="mx-auto mb-10 max-w-2xl text-center text-lg text-foreground/70 sm:text-xl">
              Receive crypto with just your routing and account number.
            </p>

            {/* CTA */}
            <div className="mb-6 flex flex-col items-center gap-4">
              <Button
                size="lg"
                asChild
                className="group press h-14 min-w-[260px] rounded-2xl text-lg font-semibold gradient-blue hover:opacity-95"
              >
                <Link href="/app">
                  Get Your Blue Wallet
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              <p className="text-sm text-muted-foreground">
                Already have one?{" "}
                <Link href="/app" className="text-blue-300 transition hover:text-blue-200">
                  Open your wallet
                </Link>
              </p>
            </div>

            <p className="mb-14 text-center text-sm text-muted-foreground">
              Zero fees · Non-custodial · Instant settlement
            </p>

            {/* Bank Logos */}
            <div className="text-center">
              <p className="mb-6 text-sm text-muted-foreground">
                Works with 12,000+ US banks including
              </p>
              <div className="flex flex-wrap items-center justify-center gap-6 opacity-80 md:gap-12 lg:gap-16">
                <div className="relative h-24 w-48 transition-transform duration-300 hover:scale-105 sm:h-32 sm:w-64 md:h-36 md:w-72">
                  <Image src="/BOFA.png" alt="Bank of America" fill className="object-contain" />
                </div>
                <div className="relative h-24 w-48 transition-transform duration-300 hover:scale-105 sm:h-32 sm:w-64 md:h-36 md:w-72">
                  <Image src="/Chase.png" alt="Chase" fill className="object-contain" />
                </div>
                <div className="relative h-24 w-48 transition-transform duration-300 hover:scale-105 sm:h-32 sm:w-64 md:h-36 md:w-72">
                  <Image src="/Wells.png" alt="Wells Fargo" fill className="object-contain" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section
          className={`px-6 py-24 transition-all duration-1000 ${
            isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}
        >
          <div className="mx-auto max-w-4xl">
            <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
              Skip the 0x address.
            </h2>
            <p className="mb-16 mt-3 text-center text-lg text-muted-foreground">
              Use your bank details instead.
            </p>

            <div className="mb-16 grid gap-5 md:grid-cols-3">
              {[
                { n: "1", title: "Verify your identity", sub: "Quick KYC powered by Bridge" },
                { n: "2", title: "Get your Blue Wallet", sub: "A wallet tied to your bank" },
                { n: "3", title: "Receive crypto", sub: "Anyone sends via wire details" },
              ].map((step) => (
                <div key={step.n} className="material relative rounded-3xl p-6 pt-8 text-center">
                  <div className="absolute -top-4 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-white/15 bg-white/[0.08] text-sm font-semibold text-white/80 backdrop-blur">
                    {step.n}
                  </div>
                  <p className="mb-2 mt-1 text-lg font-semibold text-foreground">{step.title}</p>
                  <p className="text-sm text-muted-foreground">{step.sub}</p>
                </div>
              ))}
            </div>

            {/* Stats */}
            <div className="flex justify-center">
              <div className="material inline-flex flex-wrap items-center justify-center gap-10 rounded-3xl px-8 py-6 md:gap-16">
                <div className="text-center">
                  <p className="text-4xl font-semibold tracking-tight text-gradient-blue">3s</p>
                  <p className="text-sm text-muted-foreground">instant settlement</p>
                </div>
                <div className="text-center">
                  <p className="text-4xl font-semibold tracking-tight text-gradient-blue">$0</p>
                  <p className="text-sm text-muted-foreground">platform fees</p>
                </div>
                <div className="text-center">
                  <p className="text-4xl font-semibold tracking-tight text-gradient-blue">100%</p>
                  <p className="text-sm text-muted-foreground">your keys</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
