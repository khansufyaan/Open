import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Contact | Blue Wallet",
  description: "Get in touch to explore identity-attested wallets.",
};

export default function ContactPage() {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-gradient-to-b from-sky-50 via-white to-white text-slate-900 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <div className="absolute inset-x-0 top-[-20rem] -z-10 transform-gpu blur-3xl" aria-hidden>
        <div className="mx-auto h-[32rem] w-[42rem] rounded-full bg-sky-200/40 dark:bg-sky-500/10" />
      </div>
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-20 sm:px-10 lg:px-12">
        <Link
          href="/"
          className="text-sm font-semibold uppercase tracking-[0.4em] text-sky-500 transition hover:text-sky-600 dark:text-sky-400"
        >
          Blue Wallet
        </Link>
        <main className="mt-10 flex flex-1 flex-col justify-center gap-16">
          <section className="space-y-6">
            <h1 className="text-4xl font-semibold leading-tight text-slate-900 dark:text-white sm:text-5xl">
              Let’s talk wallets and identity.
            </h1>
            <p className="text-lg leading-8 text-slate-600 dark:text-slate-300">
              Whether you’re curious about verifying existing wallets or spinning up managed keys,
              send us a note. We’ll reach out with next steps—and probably a few questions.
            </p>
          </section>

          <section className="rounded-3xl border border-slate-200/80 bg-white/70 p-8 text-slate-600 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200">
            <form
              action="mailto:hello@bluewallet.xyz"
              method="post"
              encType="text/plain"
              className="space-y-6"
            >
              <div className="grid gap-2">
                <label htmlFor="name" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Name
                </label>
                <input
                  id="name"
                  name="name"
                  required
                  placeholder="Satoshi Nakamoto"
                  className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:ring-sky-500/40"
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="email" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="you@company.com"
                  className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:ring-sky-500/40"
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="message" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  How can we help?
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={5}
                  required
                  placeholder="Tell us about your use case, team, or any questions on your mind."
                  className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:ring-sky-500/40"
                />
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit">Open email draft</Button>
                <Button variant="ghost" asChild>
                  <Link href="mailto:hello@bluewallet.xyz">Email us directly</Link>
                </Button>
              </div>
            </form>
          </section>

          <section className="text-sm text-slate-500 dark:text-slate-400">
            Prefer async notes? Send context to <a className="underline" href="mailto:hello@bluewallet.xyz">hello@bluewallet.xyz</a>
            and we’ll share timing on pilots, pricing, and policy controls.
          </section>
        </main>
      </div>
    </div>
  );
}
