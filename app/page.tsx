import { AuthFlow } from "@/components/auth-flow";
import { Navbar } from "@/components/navbar";

export default function Home() {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-gradient-to-b from-sky-50 via-white to-white text-slate-900 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <div className="absolute inset-x-0 top-[-15rem] -z-10 transform-gpu blur-3xl" aria-hidden>
        <div className="mx-auto h-[30rem] w-[40rem] rounded-full bg-sky-200/40 dark:bg-sky-500/10" />
      </div>
      <Navbar className="pt-4" />
      <div id="top" className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-4xl flex-col px-6 pb-16 pt-10 sm:px-10 lg:px-12">
        <main className="flex flex-1 flex-col justify-center gap-24">
          <section className="max-w-xl space-y-6">
            <span className="text-sm font-medium uppercase tracking-[0.4em] text-sky-500 dark:text-sky-400">
              Blue Wallet
            </span>
            <h1 className="text-4xl font-semibold leading-tight text-slate-900 dark:text-white sm:text-5xl">
              Identity-attested wallets for a compliant crypto world.
            </h1>
            <p className="text-lg leading-8 text-slate-600 dark:text-slate-300">
              Blue Wallet links on-chain addresses to bank-verified identities so
              regulated institutions can transact with confidence. Individuals keep
              self-custody, while policies on every wallet govern what flows in and
              out.
            </p>
          </section>

          <AuthFlow />

          <section className="mx-auto w-full max-w-3xl rounded-3xl border border-slate-200/80 bg-white/70 p-8 text-slate-600 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-300">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
              Contact
            </h2>
            <p className="mt-4 text-lg leading-7">
              Curious about linking wallets to real-world identity without losing self-custody?
              Send a note to <a className="underline underline-offset-4" href="mailto:hello@bluewallet.xyz">hello@bluewallet.xyz</a>.
              We read every message and occasionally reply with more questions than answers.
            </p>
            <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
              Blue Wallet is quietly stitching trust into on-chain finance. If this sounds
              interesting—or confusing—that means we’re on the right track.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
