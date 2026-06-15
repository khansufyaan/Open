"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Navbar({ className }: { className?: string }) {
  const pathname = usePathname();
  const isAppPage = pathname?.startsWith("/app");

  return (
    <header className={cn("relative z-50 w-full", className)}>
      <div className="px-4 sm:px-6 pt-4 pb-2">
        <div className="relative max-w-6xl mx-auto">
          {/* Glow effect */}
          <div className="absolute -inset-[1px] rounded-2xl opacity-50 blur-sm bg-gradient-to-r from-blue-500/30 via-blue-400/20 to-blue-500/30" />

          <nav className="relative flex w-full items-center justify-between gap-4 rounded-2xl px-4 sm:px-6 py-2.5 bg-blue-950/90 backdrop-blur-xl border border-blue-400/20">

            {/* Logo + Brand */}
            <Link href="/" className="flex items-center gap-3 transition hover:opacity-80">
              <Image
                src="/FINAL2.png"
                alt="Blue"
                width={44}
                height={44}
                className="rounded-lg"
                priority
              />
              <span className="text-xl font-bold text-white hidden sm:block">Blue Wallet</span>
            </Link>

            {/* Center Nav - Desktop */}
            <div className="hidden md:flex items-center gap-1 bg-blue-900/50 rounded-xl px-1 py-1">
              <Link
                href="/faq"
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  pathname === "/faq"
                    ? "bg-blue-500/20 text-white"
                    : "text-blue-200 hover:text-white hover:bg-blue-500/10"
                )}
              >
                FAQ
              </Link>
            </div>

            {/* Right Side - CTA */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Launch app CTA (hidden when already inside the portal) */}
              {!isAppPage && (
                <Button
                  size="sm"
                  asChild
                  className="group gradient-blue hover:opacity-90 text-white font-semibold px-4 h-10 glow-blue-sm"
                >
                  <Link href="/app">
                    <span className="hidden sm:inline">Open App</span>
                    <span className="sm:hidden">App</span>
                    <ArrowRight className="h-4 w-4 ml-1 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </Button>
              )}
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}
