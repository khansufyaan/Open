import { AuthFlow } from "@/components/auth-flow";
import { Navbar } from "@/components/navbar";

export default function Home() {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-gradient-to-b from-sky-50 via-white to-white text-slate-900 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <div className="absolute inset-x-0 top-[-15rem] -z-10 transform-gpu blur-3xl" aria-hidden>
        <div className="mx-auto h-[30rem] w-[40rem] rounded-full bg-sky-200/40 dark:bg-sky-500/10" />
      </div>
      <Navbar className="pt-4" />
      <div id="top" className="mx-auto flex min-h-[calc(100vh-9rem)] w-full max-w-6xl flex-col px-6 pb-24 pt-10 sm:px-10 lg:px-12">
        <main className="flex flex-1 items-center">
          <div className="grid w-full items-center gap-16 lg:grid-cols-[1.1fr_minmax(0,480px)] xl:gap-20">
            <section className="space-y-12">
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

              <div className="grid gap-6 rounded-3xl border border-slate-200/80 bg-white/80 p-6 text-slate-600 shadow-sm backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-300">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                  Built for
                </h2>
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Institutions
                    </h3>
                    <p className="text-sm leading-6">
                      Give compliance teams the audit trail they need—verified identities, policy
                      logs, and wallet lineage without sacrificing speed.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Teams & DAOs</h3>
                    <p className="text-sm leading-6">
                      Spin up policy-controlled wallets for contributors in seconds, or link
                      existing addresses while keeping revocation one click away.
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Need to talk details? The contact button jumps to a dedicated page with an email
                  form.
                </p>
              </div>
            </section>

            <AuthFlow />
          </div>
        </main>
      </div>
    </div>
  );
}
