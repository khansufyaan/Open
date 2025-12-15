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
    <div className={cn("flex justify-center px-6 pt-6 relative z-50", className)}>
      <nav className="grid w-full max-w-5xl grid-cols-3 items-center gap-4 rounded-2xl border border-border/50 bg-card/60 backdrop-blur-xl px-6 py-3 shadow-lg shadow-primary/5">
        <Link href="/" className="transition hover:opacity-80">
          <Image
            src="/FINAL2.png"
            alt="Blue"
            width={48}
            height={48}
            className="rounded-lg"
            priority
          />
        </Link>
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            asChild
            className={cn(
              "hover:bg-primary/10 hover:text-primary transition-colors",
              pathname === "/send" && "bg-primary/10 text-primary"
            )}
          >
            <Link href="/send">Send</Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            asChild
            className={cn(
              "hover:bg-primary/10 hover:text-primary transition-colors",
              pathname === "/recipient" && "bg-primary/10 text-primary"
            )}
          >
            <Link href="/recipient">Receive</Link>
          </Button>
        </div>
        <div className="flex items-center justify-end gap-3">
          <Button
            variant="ghost"
            size="sm"
            asChild
            className={cn(
              "hover:bg-primary/10 hover:text-primary transition-colors",
              pathname === "/contact" && "bg-primary/10 text-primary"
            )}
          >
            <Link href="/contact">Contact</Link>
          </Button>
          {pathname !== "/" && pathname !== "/recipient" && <WalletButton />}
        </div>
      </nav>
    </div>
  );
}
