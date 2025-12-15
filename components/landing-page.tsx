"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ArrowRight, ChevronRight, Wallet, Building2, ArrowDownUp, Shield, Zap, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";

function AnimatedCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const duration = 2000;
    const steps = 60;
    const increment = target / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [target]);

  return <span>{count.toLocaleString()}{suffix}</span>;
}

export function LandingPage() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/20" />

      {/* Animated orbs */}
      <div className="orb w-[800px] h-[800px] -top-96 -left-96 opacity-40 animate-float"
           style={{ background: "radial-gradient(circle, oklch(0.55 0.25 250 / 0.6), transparent 70%)" }} />
      <div className="orb w-[600px] h-[600px] top-1/3 -right-48 opacity-30 animate-float"
           style={{ background: "radial-gradient(circle, oklch(0.60 0.22 270 / 0.5), transparent 70%)", animationDelay: "-3s" }} />
      <div className="orb w-[400px] h-[400px] bottom-0 left-1/4 opacity-30 animate-float"
           style={{ background: "radial-gradient(circle, oklch(0.70 0.18 230 / 0.4), transparent 70%)", animationDelay: "-5s" }} />

      {/* Subtle grid */}
      <div className="absolute inset-0 bg-grid dark:bg-grid-dark opacity-40" />

      {/* Radial fade overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,var(--background)_70%)]" />

      <div className="relative z-10">
        {/* Hero Section */}
        <section className={`flex flex-col items-center justify-center min-h-[90vh] px-6 py-20 transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="mx-auto w-full max-w-5xl text-center space-y-8">

            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/10 text-sm font-medium text-primary backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              <span>Powered by Base Network</span>
            </div>

            {/* Main Headline with Logo */}
            <div className="flex items-center justify-center gap-6 md:gap-8">
              <Image
                src="/FINAL2.png"
                alt="Blue Wallet"
                width={120}
                height={120}
                className="rounded-2xl shadow-2xl shadow-primary/20 hidden sm:block"
              />
              <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight leading-[0.9] text-left">
                <span className="block text-foreground">Send crypto like</span>
                <span className="block text-gradient-blue mt-2">a wire transfer.</span>
              </h1>
            </div>

            {/* Mobile logo */}
            <div className="sm:hidden">
              <Image
                src="/FINAL2.png"
                alt="Blue Wallet"
                width={80}
                height={80}
                className="rounded-xl shadow-xl shadow-primary/20 mx-auto"
              />
            </div>

            {/* Subheadline - The key insight */}
            <p className="mx-auto max-w-2xl text-xl sm:text-2xl text-muted-foreground font-light leading-relaxed">
              Pay anyone using their <span className="text-foreground font-medium">bank account & routing number</span>.
              <span className="block mt-2">No wallet address needed. Just wire details.</span>
            </p>

            {/* CTA Section */}
            <div className="flex flex-col items-center gap-6 pt-6">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button
                  size="lg"
                  asChild
                  className="group relative min-w-[220px] h-16 text-lg font-semibold gradient-blue hover:opacity-90 transition-all duration-500 animate-pulse-glow overflow-hidden"
                >
                  <Link href="/send">
                    <span className="relative z-10 flex items-center">
                      Send USDC Now
                      <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  asChild
                  className="min-w-[220px] h-16 text-lg font-medium border border-border/50 hover:bg-primary/5 hover:border-primary/30 transition-all duration-300"
                >
                  <Link href="/recipient">
                    Get a Blue Wallet
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              </div>

              {/* Trust signal */}
              <p className="text-sm text-muted-foreground">
                0% platform fees • Instant settlement • Non-custodial
              </p>
            </div>

            {/* Supported Banks - Large logos */}
            <div className="pt-16">
              <p className="text-sm text-muted-foreground mb-8 uppercase tracking-widest">Works with 12,000+ US banks including</p>
              <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16">
                <div className="relative w-48 h-24 md:w-64 md:h-32 hover:scale-105 transition-transform duration-300">
                  <Image src="/BOFA.png" alt="Bank of America" fill className="object-contain" />
                </div>
                <div className="relative w-48 h-24 md:w-64 md:h-32 hover:scale-105 transition-transform duration-300">
                  <Image src="/Chase.png" alt="Chase" fill className="object-contain" />
                </div>
                <div className="relative w-48 h-24 md:w-64 md:h-32 hover:scale-105 transition-transform duration-300">
                  <Image src="/Wells.png" alt="Wells Fargo" fill className="object-contain" />
                </div>
              </div>
              <p className="mt-6 text-muted-foreground">+ thousands more via Plaid</p>
            </div>
          </div>
        </section>

        {/* What is Blue Wallet - The explainer */}
        <section className={`px-6 py-24 transition-all duration-1000 delay-200 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="mx-auto max-w-6xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black mb-6">
                What is a <span className="text-gradient-blue">Blue Wallet</span>?
              </h2>
              <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
                A Blue Wallet is a crypto wallet linked to your verified bank account.
                If you have a bank account, you can receive crypto — <span className="text-foreground">no crypto experience required</span>.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {/* For Crypto Senders */}
              <div className="relative group p-8 rounded-3xl border border-border/50 bg-card/30 backdrop-blur-sm hover:border-primary/30 transition-all duration-300">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative">
                  <div className="mb-6 inline-flex p-4 rounded-2xl bg-primary/10 text-primary">
                    <Wallet className="h-8 w-8" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">For Crypto Users</h3>
                  <p className="text-muted-foreground mb-6 leading-relaxed">
                    Send USDC to anyone using the same info businesses use for wire transfers:
                    <span className="text-foreground font-medium"> account number + routing number</span>.
                  </p>
                  <ul className="space-y-3">
                    <li className="flex items-center gap-3 text-sm">
                      <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                      <span>No need to ask for wallet addresses</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm">
                      <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                      <span>Pay contractors, vendors, or friends</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm">
                      <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                      <span>Works like sending a wire — but instant</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* For Recipients */}
              <div className="relative group p-8 rounded-3xl border border-border/50 bg-card/30 backdrop-blur-sm hover:border-primary/30 transition-all duration-300">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative">
                  <div className="mb-6 inline-flex p-4 rounded-2xl bg-primary/10 text-primary">
                    <Building2 className="h-8 w-8" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4">For Recipients</h3>
                  <p className="text-muted-foreground mb-6 leading-relaxed">
                    Your bank already verified your identity. That&apos;s all you need.
                    <span className="text-foreground font-medium"> Claim your Blue Wallet</span> and receive crypto to your bank.
                  </p>
                  <ul className="space-y-3">
                    <li className="flex items-center gap-3 text-sm">
                      <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                      <span>KYC&apos;d through your existing bank</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm">
                      <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                      <span>No crypto knowledge needed</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm">
                      <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                      <span>Funds go directly to your bank account</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works - Visual flow */}
        <section className={`px-6 py-24 transition-all duration-1000 delay-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="mx-auto max-w-5xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">How it works</h2>
              <p className="text-muted-foreground text-lg">Simple as sending a wire transfer</p>
            </div>

            {/* Flow diagram */}
            <div className="relative">
              {/* Connection line - desktop */}
              <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-1 bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20 -translate-y-1/2" />

              <div className="grid lg:grid-cols-4 gap-8">
                {/* Step 1 */}
                <div className="relative text-center">
                  <div className="relative z-10 mx-auto w-20 h-20 rounded-2xl bg-card border border-primary/30 flex items-center justify-center mb-6 shadow-lg shadow-primary/10">
                    <Wallet className="h-8 w-8 text-primary" />
                  </div>
                  <div className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full inline-block mb-3">Step 1</div>
                  <h3 className="text-lg font-bold mb-2">Connect Wallet</h3>
                  <p className="text-sm text-muted-foreground">Link your crypto wallet with USDC</p>
                </div>

                {/* Step 2 */}
                <div className="relative text-center">
                  <div className="relative z-10 mx-auto w-20 h-20 rounded-2xl bg-card border border-primary/30 flex items-center justify-center mb-6 shadow-lg shadow-primary/10">
                    <Building2 className="h-8 w-8 text-primary" />
                  </div>
                  <div className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full inline-block mb-3">Step 2</div>
                  <h3 className="text-lg font-bold mb-2">Enter Bank Details</h3>
                  <p className="text-sm text-muted-foreground">Account number + routing number</p>
                </div>

                {/* Step 3 */}
                <div className="relative text-center">
                  <div className="relative z-10 mx-auto w-20 h-20 rounded-2xl bg-card border border-primary/30 flex items-center justify-center mb-6 shadow-lg shadow-primary/10">
                    <ArrowDownUp className="h-8 w-8 text-primary" />
                  </div>
                  <div className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full inline-block mb-3">Step 3</div>
                  <h3 className="text-lg font-bold mb-2">Send USDC</h3>
                  <p className="text-sm text-muted-foreground">Instant transfer to Blue Wallet</p>
                </div>

                {/* Step 4 */}
                <div className="relative text-center">
                  <div className="relative z-10 mx-auto w-20 h-20 rounded-2xl bg-card border border-primary/30 flex items-center justify-center mb-6 shadow-lg shadow-primary/10">
                    <CheckCircle2 className="h-8 w-8 text-primary" />
                  </div>
                  <div className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full inline-block mb-3">Step 4</div>
                  <h3 className="text-lg font-bold mb-2">Recipient Claims</h3>
                  <p className="text-sm text-muted-foreground">Funds arrive in their bank</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why Blue Wallet */}
        <section className={`px-6 py-24 transition-all duration-1000 delay-400 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="mx-auto max-w-5xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Why businesses love this</h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                The same workflow you use for wire transfers — now for crypto payments
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="p-6 rounded-2xl border border-border/50 bg-card/30 backdrop-blur-sm">
                <div className="mb-4 inline-flex p-3 rounded-xl bg-primary/10 text-primary">
                  <Zap className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-lg mb-2">Instant Settlement</h3>
                <p className="text-sm text-muted-foreground">
                  No more waiting 3-5 business days. USDC settles in seconds.
                </p>
              </div>

              <div className="p-6 rounded-2xl border border-border/50 bg-card/30 backdrop-blur-sm">
                <div className="mb-4 inline-flex p-3 rounded-xl bg-primary/10 text-primary">
                  <Shield className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-lg mb-2">Bank-Level KYC</h3>
                <p className="text-sm text-muted-foreground">
                  Recipients are verified by their banks. Compliant by default.
                </p>
              </div>

              <div className="p-6 rounded-2xl border border-border/50 bg-card/30 backdrop-blur-sm">
                <div className="mb-4 inline-flex p-3 rounded-xl bg-primary/10 text-primary">
                  <Building2 className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-lg mb-2">Familiar Workflow</h3>
                <p className="text-sm text-muted-foreground">
                  Use the same account + routing numbers you already have on file.
                </p>
              </div>

              <div className="p-6 rounded-2xl border border-border/50 bg-card/30 backdrop-blur-sm">
                <div className="mb-4 inline-flex p-3 rounded-xl bg-primary/10 text-primary">
                  <Wallet className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-lg mb-2">Non-Custodial</h3>
                <p className="text-sm text-muted-foreground">
                  We never hold your funds. You control your keys.
                </p>
              </div>

              <div className="p-6 rounded-2xl border border-border/50 bg-card/30 backdrop-blur-sm">
                <div className="mb-4 inline-flex p-3 rounded-xl bg-primary/10 text-primary">
                  <ArrowDownUp className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-lg mb-2">Global Reach</h3>
                <p className="text-sm text-muted-foreground">
                  Send to anyone with a US bank account. International coming soon.
                </p>
              </div>

              <div className="p-6 rounded-2xl border border-border/50 bg-card/30 backdrop-blur-sm">
                <div className="mb-4 inline-flex p-3 rounded-xl bg-primary/10 text-primary">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="font-bold text-lg mb-2">Zero Platform Fees</h3>
                <p className="text-sm text-muted-foreground">
                  Only pay network gas. No hidden fees or percentages.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className={`px-6 py-24 transition-all duration-1000 delay-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="mx-auto max-w-4xl">
            <div className="relative rounded-3xl border border-primary/20 bg-card/30 backdrop-blur-xl p-12 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5" />

              <div className="relative grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
                <div className="space-y-2">
                  <div className="text-4xl sm:text-5xl font-black text-gradient-blue">
                    <AnimatedCounter target={50} suffix="K+" />
                  </div>
                  <p className="text-sm text-muted-foreground">Transactions</p>
                </div>
                <div className="space-y-2">
                  <div className="text-4xl sm:text-5xl font-black text-gradient-blue">
                    $<AnimatedCounter target={12} suffix="M+" />
                  </div>
                  <p className="text-sm text-muted-foreground">Volume</p>
                </div>
                <div className="space-y-2">
                  <div className="text-4xl sm:text-5xl font-black text-gradient-blue">
                    <AnimatedCounter target={3} suffix="s" />
                  </div>
                  <p className="text-sm text-muted-foreground">Avg. Speed</p>
                </div>
                <div className="space-y-2">
                  <div className="text-4xl sm:text-5xl font-black text-gradient-blue">
                    12K+
                  </div>
                  <p className="text-sm text-muted-foreground">Banks Supported</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className={`px-6 py-32 transition-all duration-1000 delay-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <div className="mx-auto max-w-4xl">
            <div className="relative rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card/50 to-primary/5 backdrop-blur-xl p-12 md:p-16 text-center overflow-hidden">
              <div className="absolute inset-0 bg-grid dark:bg-grid-dark opacity-20" />

              <div className="relative space-y-8">
                <h2 className="text-4xl sm:text-5xl md:text-6xl font-black">
                  Ready to send crypto
                  <span className="text-gradient-blue block mt-2">the easy way?</span>
                </h2>
                <p className="text-xl text-muted-foreground max-w-xl mx-auto">
                  Stop asking for wallet addresses. Start using bank details.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
                  <Button
                    size="lg"
                    asChild
                    className="group min-w-[240px] h-16 text-lg font-semibold gradient-blue hover:opacity-90 transition-all duration-500 animate-pulse-glow"
                  >
                    <Link href="/send">
                      Send USDC Now
                      <ChevronRight className="ml-2 h-6 w-6 transition-transform group-hover:translate-x-1" />
                    </Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    asChild
                    className="min-w-[240px] h-16 text-lg font-medium border-primary/30 hover:bg-primary/10 transition-all duration-300"
                  >
                    <Link href="/recipient">
                      Get Your Blue Wallet
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
