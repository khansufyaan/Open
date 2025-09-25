import { AuthFlow } from "@/components/auth-flow";
import { Navbar } from "@/components/navbar";

export default function Home() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <Navbar />
      <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10 lg:px-12">
        <main className="grid gap-16 lg:grid-cols-2 lg:gap-24">
          <section className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-5xl">
                Identity-attested wallets for a compliant crypto world.
              </h1>
              <p className="text-lg text-slate-600 dark:text-slate-400">
                We link self-custodied wallets to bank-verified identities, layer in policy controls,
                and give institutions an auditable trail without compromising sovereignty.
              </p>
            </div>

            <div className="space-y-6 text-slate-600 dark:text-slate-400">
              <div>
                <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">Verified identity</h3>
                <p>Plaid-backed onboarding links every user to their real-world identity in minutes.</p>
              </div>
              <div>
                <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">Policy guardrails</h3>
                <p>Turnkey policies define what flows in or out—address allowlists, spending caps, and approval workflows.</p>
              </div>
              <div>
                <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">Proof your partners trust</h3>
                <p>Share verification badges and timestamps that counterparties can check instantly.</p>
              </div>
            </div>

            <div className="space-y-4 pt-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Built for
              </h2>
              <div className="space-y-4">
                <div>
                  <h3 className="mb-1 font-semibold text-slate-900 dark:text-white">Institutions</h3>
                  <p className="text-slate-600 dark:text-slate-400">
                    Give compliance teams the audit trail they need—verified identities, policy
                    logs, and wallet lineage without sacrificing speed.
                  </p>
                </div>
                <div>
                  <h3 className="mb-1 font-semibold text-slate-900 dark:text-white">Teams & DAOs</h3>
                  <p className="text-slate-600 dark:text-slate-400">
                    Spin up policy-controlled wallets for contributors in seconds, or link
                    existing addresses while keeping revocation one click away.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <AuthFlow />
        </main>
      </div>
    </div>
  );
}
