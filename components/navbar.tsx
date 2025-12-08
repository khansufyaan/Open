"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { WalletButton } from "@/components/wallet-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Navbar({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <div className={cn("flex justify-center px-6 pt-6", className)}>
      <nav className="grid w-full max-w-5xl grid-cols-3 items-center gap-4 rounded-full border border-slate-200/70 bg-white/85 px-6 py-3 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/85">
        <Link href="/" className="transition hover:opacity-80">
          <Image
            src="/FINAL2.png"
            alt="Blue"
            width={52}
            height={52}
            className="rounded-lg"
            priority
          />
        </Link>
        <div className="flex items-center justify-center gap-3">
          <Button variant="secondary" size="sm" asChild>
            <Link href="/send">Send</Link>
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <Link href="/recipient">Receive</Link>
          </Button>
        </div>
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/contact">Contact</Link>
          </Button>
          {pathname !== "/" && pathname !== "/recipient" && <WalletButton />}
        </div>
      </nav>
    </div>
  );
}
