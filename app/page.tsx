import { AuthFlow } from "@/components/auth-flow";
import { Navbar } from "@/components/navbar";

export default function Home() {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-gradient-to-b from-sky-50 via-white to-white text-slate-900 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <div className="absolute inset-x-0 top-[-15rem] -z-10 transform-gpu blur-3xl" aria-hidden>
        <div className="mx-auto h-[30rem] w-[40rem] rounded-full bg-sky-200/40 dark:bg-sky-500/10" />
      </div>
      <Navbar className="pt-4" />
      <div id="top" className="mx-auto flex min-h-[calc(100vh-9rem)] w-full max-w-6xl flex-col px-6 pb-16 pt-10 sm:px-10 lg:px-12">
        <main className="flex flex-1 items-center">
          <div className="grid w-full items-center gap-16 lg:grid-cols-[1.1fr_minmax(0,480px)] xl:gap-20">
            <section className="space-y-10">
              <div className="space-y-6">
                <span className="text-sm font-medium uppercase tracking-[0.4em] text-sky-500 dark:text-sky-400">
                  Blue Wallet
                </span>
                <h1 className="text-balance text-4xl font-semibold leading-tight text-slate-900 dark:text-white sm:text-5xl">
                  Identity-attested wallets for a compliant crypto world.
                </h1>
                <p className="text-lg leading-8 text-slate-600 dark:text-slate-300">
                  We link self-custodied wallets to bank-verified identities, layer in policy controls,
                  and give institutions an auditable trail without compromising sovereignty.
                </p>
              </div>

              <div className="grid gap-4 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Verified identity</h3>
                  <p className="mt-2 leading-6">
                    Plaid-backed onboarding links every user to their real-world identity in minutes.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Policy guardrails</h3>
                  <p className="mt-2 leading-6">
                    Turnkey policies define what flows in or out—address allowlists, spending caps,
                    and approval workflows.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Proof your partners trust</h3>
                  <p className="mt-2 leading-6">
                    Share verification badges and timestamps that counterparties can check instantly.
                  </p>
                </div>
              </div>

              <section
                id="contact"
                className="grid gap-4 rounded-3xl border border-slate-200/80 bg-white/80 p-6 text-slate-600 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-300"
              >
                <header className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                      Contact
                    </h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      We reply within two business days.
                    </p>
                  </div>
                  <a className="text-sm font-medium text-sky-600 hover:underline" href="mailto:hello@bluewallet.xyz">
                    hello@bluewallet.xyz
                  </a>
                </header>
                <form
                  action="mailto:hello@bluewallet.xyz"
                  method="post"
                  encType="text/plain"
                  className="grid gap-4 text-sm"
                >
                  <input
                    name="name"
                    required
                    placeholder="Name"
                    className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:ring-sky-500/40"
                  />
                  <input
                    name="email"
                    type="email"
                    required
                    placeholder="Email"
                    className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:ring-sky-500/40"
                  />
                  <textarea
                    name="message"
                    placeholder="What should we explore together?"
                    rows={3}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-sky-500 dark:focus:ring-sky-500/40"
                  />
                  <button
                    type="submit"
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-100"
                  >
                    Open email draft
                  </button>
                </form>
              </section>
            </section>

            <AuthFlow />
          </div>
        </main>
      </div>
    </div>
  );
}
