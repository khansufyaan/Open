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
      {/* Background effects */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-blue-950/20" />

      <div className="relative z-10">
        {/* Hero Section */}
        <section className={`min-h-[85vh] flex flex-col items-center justify-center px-6 py-12 transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="w-full max-w-6xl">

            {/* Headline - What Blue Wallet IS */}
            <div className="text-center mb-6">
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[1]">
                <span className="block text-foreground">The first crypto wallet</span>
                <span className="block text-gradient-blue mt-2">linked to your bank.</span>
              </h1>
            </div>

            {/* What it enables */}
            <p className="text-center text-xl sm:text-2xl text-foreground/90 max-w-2xl mx-auto mb-10">
              Receive crypto with just your routing and account number.
            </p>

            {/* Single focused CTA */}
            <div className="flex flex-col items-center gap-4 mb-6">
              <Button
                size="lg"
                asChild
                className="group relative min-w-[280px] h-16 text-xl font-semibold gradient-blue hover:opacity-90 transition-all duration-500 animate-pulse-glow overflow-hidden"
              >
                <Link href="/recipient">
                  Get Your Blue Wallet
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              <p className="text-sm text-muted-foreground">
                Already have one? <Link href="/send" className="text-blue-400 hover:underline">Send USDC to someone</Link>
              </p>
            </div>

            <p className="text-center text-sm text-muted-foreground mb-12">
              Zero fees • Non-custodial • Instant settlement
            </p>

            {/* Bank Logos */}
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-6">Works with 12,000+ US banks including</p>
              <div className="flex flex-wrap items-center justify-center gap-6 md:gap-12 lg:gap-16">
                <div className="relative w-48 h-24 sm:w-64 sm:h-32 md:w-72 md:h-36 hover:scale-105 transition-transform duration-300">
                  <Image src="/BOFA.png" alt="Bank of America" fill className="object-contain" />
                </div>
                <div className="relative w-48 h-24 sm:w-64 sm:h-32 md:w-72 md:h-36 hover:scale-105 transition-transform duration-300">
                  <Image src="/Chase.png" alt="Chase" fill className="object-contain" />
                </div>
                <div className="relative w-48 h-24 sm:w-64 sm:h-32 md:w-72 md:h-36 hover:scale-105 transition-transform duration-300">
                  <Image src="/Wells.png" alt="Wells Fargo" fill className="object-contain" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className={`px-6 py-24 transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-black text-center mb-4">
              Skip the 0x address.
            </h2>
            <p className="text-center text-lg text-muted-foreground mb-16">
              Use your bank details instead.
            </p>

            <div className="grid md:grid-cols-3 gap-8 mb-16">
              <div className="relative p-6 rounded-2xl bg-card/30 border border-border/50 text-center">
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold">1</div>
                <p className="font-semibold text-lg text-foreground mt-2 mb-2">Connect your bank</p>
                <p className="text-sm text-muted-foreground">Securely verify via Plaid</p>
              </div>
              <div className="relative p-6 rounded-2xl bg-card/30 border border-border/50 text-center">
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold">2</div>
                <p className="font-semibold text-lg text-foreground mt-2 mb-2">Get your Blue Wallet</p>
                <p className="text-sm text-muted-foreground">A wallet tied to your bank</p>
              </div>
              <div className="relative p-6 rounded-2xl bg-card/30 border border-border/50 text-center">
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold">3</div>
                <p className="font-semibold text-lg text-foreground mt-2 mb-2">Receive crypto</p>
                <p className="text-sm text-muted-foreground">Anyone sends via wire details</p>
              </div>
            </div>

            {/* Stats */}
            <div className="flex justify-center">
              <div className="inline-flex flex-wrap items-center justify-center gap-10 md:gap-16 px-8 py-6 rounded-2xl bg-blue-500/5 border border-blue-500/20">
                <div className="text-center">
                  <p className="text-4xl font-black text-gradient-blue">3s</p>
                  <p className="text-sm text-muted-foreground">instant settlement</p>
                </div>
                <div className="text-center">
                  <p className="text-4xl font-black text-gradient-blue">$0</p>
                  <p className="text-sm text-muted-foreground">platform fees</p>
                </div>
                <div className="text-center">
                  <p className="text-4xl font-black text-gradient-blue">100%</p>
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
