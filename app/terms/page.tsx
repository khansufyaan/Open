import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function TermsOfServicePage() {
  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              ← Back to Home
            </Button>
          </Link>
          <h1 className="text-4xl font-bold tracking-tight">Terms of Service</h1>
          <p className="text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
        </div>

        <div className="prose prose-slate dark:prose-invert max-w-none space-y-6">
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground">
              By accessing or using Blue Wallet, you agree to be bound by these Terms of Service and all applicable laws and regulations. 
              If you do not agree with any part of these terms, you may not use our services.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">2. Service Description</h2>
            <p className="text-muted-foreground">
              Blue Wallet provides identity-attested wallet infrastructure for compliant crypto-to-fiat transfers. Our services include:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Secure wallet creation and management</li>
              <li>Identity verification and KYC compliance</li>
              <li>Bank account linking through Plaid</li>
              <li>USDC transfers on Base Network</li>
              <li>Conversion to fiat currency</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">3. Eligibility</h2>
            <p className="text-muted-foreground">
              To use Blue Wallet, you must:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Be at least 18 years of age</li>
              <li>Have the legal capacity to enter into binding contracts</li>
              <li>Not be located in a jurisdiction where our services are prohibited</li>
              <li>Complete identity verification requirements</li>
              <li>Provide accurate and complete information</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">4. Account Security</h2>
            <p className="text-muted-foreground">
              You are responsible for:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Maintaining the confidentiality of your account credentials</li>
              <li>All activities that occur under your account</li>
              <li>Notifying us immediately of any unauthorized access</li>
              <li>Ensuring your contact information is current</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">5. Fees and Surcharges</h2>
            <p className="text-muted-foreground">
              Blue Wallet charges a surcharge on transfers to cover operational costs and gas fees. Current surcharge rate is 5% of the transfer amount. 
              Fees are subject to change with 30 days notice.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">6. Prohibited Activities</h2>
            <p className="text-muted-foreground">
              You may not use Blue Wallet to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Engage in money laundering or terrorist financing</li>
              <li>Violate any applicable laws or regulations</li>
              <li>Impersonate another person or entity</li>
              <li>Interfere with or disrupt our services</li>
              <li>Attempt to gain unauthorized access to our systems</li>
              <li>Use the service for any illegal purpose</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">7. Transaction Limits</h2>
            <p className="text-muted-foreground">
              We may impose transaction limits based on your verification level, transaction history, and risk assessment. 
              We reserve the right to refuse or reverse any transaction that violates these terms or appears suspicious.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">8. Liability Limitations</h2>
            <p className="text-muted-foreground">
              Blue Wallet is not liable for:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Loss of funds due to user error or negligence</li>
              <li>Network delays or blockchain congestion</li>
              <li>Third-party service disruptions</li>
              <li>Market volatility or price fluctuations</li>
              <li>Regulatory changes affecting service availability</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">9. Account Termination</h2>
            <p className="text-muted-foreground">
              We reserve the right to suspend or terminate your account if you violate these terms, engage in suspicious activity, 
              or fail to comply with verification requirements. You may close your account at any time after withdrawing all funds.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">10. Dispute Resolution</h2>
            <p className="text-muted-foreground">
              Any disputes arising from these terms will be resolved through binding arbitration in accordance with the rules of the American Arbitration Association. 
              You waive your right to participate in class action lawsuits.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">11. Changes to Terms</h2>
            <p className="text-muted-foreground">
              We may modify these terms at any time. Continued use of our services after changes constitutes acceptance of the new terms. 
              We will notify you of material changes via email or in-app notification.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">12. Contact Information</h2>
            <p className="text-muted-foreground">
              For questions about these Terms of Service, contact us at:
            </p>
            <p className="text-muted-foreground">
              Email: <a href="mailto:admin@bluewaas.com" className="text-sky-500 hover:underline">admin@bluewaas.com</a>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
