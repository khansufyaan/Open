import { Navbar } from "@/components/navbar";

export default function Home() {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-gradient-to-b from-sky-50 via-white to-white text-slate-900 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <div className="absolute inset-x-0 top-[-15rem] -z-10 transform-gpu blur-3xl" aria-hidden>
        <div className="mx-auto h-[30rem] w-[40rem] rounded-full bg-sky-200/40 dark:bg-sky-500/10" />
      </div>
      <Navbar className="pt-4" />
      <div id="top" className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-4xl flex-col px-6 pb-16 pt-10 sm:px-10 lg:px-12">
        <main className="flex flex-1 flex-col justify-center">
          <span className="text-sm font-medium uppercase tracking-[0.4em] text-sky-500 dark:text-sky-400">
            Blue Wallet
          </span>
          <h1 className="mt-6 text-4xl font-semibold leading-tight text-slate-900 dark:text-white sm:text-5xl">
            Identity-attested wallets for a compliant crypto world.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600 dark:text-slate-300">
            Blue Wallet links on-chain addresses to bank-verified identities so
            regulated institutions can transact with confidence. Individuals keep
            self-custody, while policies on every wallet govern what flows in and
            out.
          </p>
          <div className="mt-12 grid gap-8 text-base text-slate-500 dark:text-slate-400 sm:grid-cols-2">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                What we offer
              </h2>
              <p className="mt-3 leading-7 text-slate-600 dark:text-slate-300">
                KYC-backed wallet creation, seamless connection of existing
                addresses, and transparent verification badges you can share with
                partners.
              </p>
            </div>
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                Why it matters
              </h2>
              <p className="mt-3 leading-7 text-slate-600 dark:text-slate-300">
                Give institutions an open door to crypto by proving who controls a
                wallet, while enforcing Turnkey policies that keep every
                transaction within agreed guardrails.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
