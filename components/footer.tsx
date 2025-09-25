import Link from "next/link";

import { cn } from "@/lib/utils";

const links = [
  { href: "#top", label: "Home" },
  { href: "/contact", label: "Contact" },
  { href: "https://github.com/ebrahim575/blue-wallet", label: "GitHub", external: true },
];

export function Footer({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "mt-16 border-t border-slate-200/60 bg-white/70 py-8 text-sm text-slate-500 backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-400",
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 sm:flex-row sm:items-center sm:justify-between sm:px-10 lg:px-12">
        <p className="text-xs uppercase tracking-[0.4em] text-slate-600 dark:text-slate-300">
          Blue Wallet
        </p>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          {links.map(({ href, label, external }) => (
            <Link
              key={href}
              href={href}
              target={external ? "_blank" : undefined}
              rel={external ? "noreferrer" : undefined}
              className="transition hover:text-slate-900 dark:hover:text-slate-100"
            >
              {label}
            </Link>
          ))}
        </nav>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          © {new Date().getFullYear()} Blue Wallet. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
