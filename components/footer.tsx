import Link from "next/link";

import { cn } from "@/lib/utils";

export function Footer({ className }: { className?: string }) {
  return (
    <footer className={cn("border-t px-6 pb-8 pt-10 sm:px-10", className)}>
      <div className="container flex flex-col items-center justify-between gap-4 md:h-24 md:flex-row">
        <div className="flex flex-col items-center gap-4 px-8 md:flex-row md:gap-2 md:px-0">
          <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
            Built by{" "}
            <Link
              href="https://github.com/ebrahim575/blue-wallet"
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-4"
            >
              Blue Wallet
            </Link>
            . The source code is available on{" "}
            <Link
              href="https://github.com/ebrahim575/blue-wallet"
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-4"
            >
              GitHub
            </Link>
            .
          </p>
        </div>
      </div>
    </footer>
  );
}
