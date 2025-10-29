import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function PrivacyPolicyPage() {
  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              ← Back to Home
            </Button>
          </Link>
          <h1 className="text-4xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
        </div>

        <div className="prose prose-slate dark:prose-invert max-w-none space-y-6">
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">1. Information We Collect</h2>
            <p className="text-muted-foreground">
              Blue Wallet collects information to provide secure, identity-attested wallet services. This includes:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong>Identity Information:</strong> Name, email address, and government-issued identification for KYC compliance</li>
              <li><strong>Financial Information:</strong> Bank account details, routing numbers, and transaction history</li>
              <li><strong>Wallet Data:</strong> Blockchain addresses, transaction records, and wallet balances</li>
              <li><strong>Usage Data:</strong> Device information, IP addresses, and interaction logs</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">2. How We Use Your Information</h2>
            <p className="text-muted-foreground">
              We use your information to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Verify your identity and maintain regulatory compliance</li>
              <li>Process crypto-to-fiat transfers securely</li>
              <li>Prevent fraud and unauthorized access</li>
              <li>Improve our services and user experience</li>
              <li>Communicate important updates and security notices</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">3. Data Security</h2>
            <p className="text-muted-foreground">
              We implement industry-leading security measures to protect your data:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>End-to-end encryption for all sensitive data</li>
              <li>Secure key management through enterprise infrastructure</li>
              <li>Multi-factor authentication requirements</li>
              <li>Regular security audits and penetration testing</li>
              <li>Compliance with SOC 2 Type II standards</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">4. Third-Party Services</h2>
            <p className="text-muted-foreground">
              We work with trusted third-party providers to deliver our services:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong>Wallet Infrastructure:</strong> Secure wallet infrastructure and key management</li>
              <li><strong>Plaid:</strong> Bank account verification and linking</li>
              <li><strong>AWS:</strong> Cloud infrastructure and data storage</li>
              <li><strong>Base Network:</strong> Blockchain transaction processing</li>
            </ul>
            <p className="text-muted-foreground">
              These partners are contractually obligated to protect your data and use it only for specified purposes.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">5. Data Retention</h2>
            <p className="text-muted-foreground">
              We retain your personal data only as long as necessary to provide our services and comply with legal obligations. 
              Transaction records may be retained for up to 7 years to meet regulatory requirements.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">6. Your Rights</h2>
            <p className="text-muted-foreground">
              You have the right to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Access your personal data</li>
              <li>Request corrections to inaccurate information</li>
              <li>Request deletion of your data (subject to legal requirements)</li>
              <li>Opt-out of marketing communications</li>
              <li>Export your transaction history</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">7. Contact Us</h2>
            <p className="text-muted-foreground">
              If you have questions about this Privacy Policy or how we handle your data, please contact us at:
            </p>
            <p className="text-muted-foreground">
              Email: <a href="mailto:privacy@bluewallet.com" className="text-sky-500 hover:underline">privacy@bluewallet.com</a>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
