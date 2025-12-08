import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function FAQPage() {
  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              ← Back to Home
            </Button>
          </Link>
          <h1 className="text-4xl font-bold tracking-tight">Frequently Asked Questions</h1>
          <p className="text-muted-foreground">
            Find answers to common questions about Blue and how it works.
          </p>
        </div>

        <Accordion type="single" collapsible className="w-full space-y-4">
          <AccordionItem value="what-is-blue" className="rounded-lg border px-4">
            <AccordionTrigger className="text-left font-medium">
              What is Blue?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Blue is a non-custodial wallet platform that enables you to send and receive USDC stablecoins using your bank account. We provide KYC-compliant wallet infrastructure that protects your privacy while meeting regulatory requirements.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="what-is-usdc" className="rounded-lg border px-4">
            <AccordionTrigger className="text-left font-medium">
              What is USDC?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              USDC (USD Coin) is a stablecoin pegged 1:1 to the US dollar. It&apos;s issued by Circle and is one of the most trusted and widely used stablecoins in the cryptocurrency ecosystem. Each USDC is backed by fully reserved assets held in regulated financial institutions.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="how-send" className="rounded-lg border px-4">
            <AccordionTrigger className="text-left font-medium">
              How do I send USDC?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              To send USDC, connect your wallet on the Send page, enter the recipient&apos;s email address and the amount you want to send. The recipient will receive an email notification and can claim the funds by verifying their identity through our KYC process.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="how-receive" className="rounded-lg border px-4">
            <AccordionTrigger className="text-left font-medium">
              How do I receive USDC?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              When someone sends you USDC through Blue, you&apos;ll receive an email notification. Visit the Receive page, verify your identity with your email, and complete our KYC process by linking your bank account. Once verified, you can claim your funds to your managed wallet.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="what-is-kyc" className="rounded-lg border px-4">
            <AccordionTrigger className="text-left font-medium">
              What is KYC and why is it required?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              KYC (Know Your Customer) is a regulatory requirement that helps prevent fraud, money laundering, and other financial crimes. By verifying your identity through your bank account, we ensure that transfers are secure and compliant with financial regulations while protecting your privacy.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="non-custodial" className="rounded-lg border px-4">
            <AccordionTrigger className="text-left font-medium">
              What does non-custodial mean?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Non-custodial means you maintain full control of your funds. Blue never holds your private keys or has access to move your funds without your permission. Your wallet is managed through secure infrastructure where only you can authorize transactions.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="which-banks" className="rounded-lg border px-4">
            <AccordionTrigger className="text-left font-medium">
              Which banks are supported?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Blue supports most major US banks including Bank of America, Chase, Wells Fargo, and thousands of other financial institutions through our Plaid integration. During the KYC process, you can search for and connect your bank.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="fees" className="rounded-lg border px-4">
            <AccordionTrigger className="text-left font-medium">
              What are the fees?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Blue charges a 5% surcharge on transfers to cover operational costs and network gas fees. This fee is transparently displayed before you confirm any transaction. There are no hidden fees or monthly charges.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="how-long" className="rounded-lg border px-4">
            <AccordionTrigger className="text-left font-medium">
              How long do transfers take?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Sending USDC is nearly instant once your wallet transaction is confirmed on the Base network (usually within seconds). Recipients can claim their funds immediately after completing KYC verification, which typically takes just a few minutes.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="what-is-base" className="rounded-lg border px-4">
            <AccordionTrigger className="text-left font-medium">
              What is the Base network?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Base is a secure, low-cost Ethereum Layer 2 network built by Coinbase. It provides fast transaction speeds and minimal gas fees while maintaining the security of the Ethereum blockchain. All Blue transactions occur on the Base network.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="withdraw" className="rounded-lg border px-4">
            <AccordionTrigger className="text-left font-medium">
              Can I withdraw to an external wallet?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Yes, after claiming your funds to your managed wallet, you can withdraw to any external Base-compatible wallet address. Simply enter the destination address and confirm the withdrawal from your dashboard.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="security" className="rounded-lg border px-4">
            <AccordionTrigger className="text-left font-medium">
              How secure is Blue?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Blue uses enterprise-grade security infrastructure including end-to-end encryption, secure key management, and multi-factor authentication. We partner with industry-leading providers and undergo regular security audits to ensure your funds and data are protected.
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="support" className="rounded-lg border px-4">
            <AccordionTrigger className="text-left font-medium">
              How can I get help?
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              If you have questions or need assistance, please visit our <Link href="/contact" className="text-sky-500 hover:underline">Contact page</Link> or email us at <a href="mailto:admin@bluewaas.com" className="text-sky-500 hover:underline">admin@bluewaas.com</a>. Our support team is here to help.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </main>
  );
}
