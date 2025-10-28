import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ContactPage() {
  return (
    <main className="flex-1 px-6 py-12">
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="space-y-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              ← Back to Home
            </Button>
          </Link>
          <h1 className="text-4xl font-bold tracking-tight">Contact Us</h1>
          <p className="text-muted-foreground">
            Have questions or need help? Get in touch with our team.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          <div className="space-y-6">
            <div className="rounded-lg border bg-card p-6 space-y-4">
              <h2 className="text-xl font-semibold">Get in Touch</h2>
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-medium mb-1">Email</h3>
                  <a href="mailto:support@bluewallet.com" className="text-sm text-sky-500 hover:underline">
                    support@bluewallet.com
                  </a>
                </div>
                <div>
                  <h3 className="text-sm font-medium mb-1">Response Time</h3>
                  <p className="text-sm text-muted-foreground">
                    We typically respond within 24 hours
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium mb-1">Support Hours</h3>
                  <p className="text-sm text-muted-foreground">
                    Monday - Friday: 9AM - 6PM EST
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-card p-6 space-y-4">
              <h2 className="text-xl font-semibold">Other Ways to Reach Us</h2>
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-medium mb-1">Security Issues</h3>
                  <a href="mailto:security@bluewallet.com" className="text-sm text-sky-500 hover:underline">
                    security@bluewallet.com
                  </a>
                </div>
                <div>
                  <h3 className="text-sm font-medium mb-1">Business Inquiries</h3>
                  <a href="mailto:partnerships@bluewallet.com" className="text-sm text-sky-500 hover:underline">
                    partnerships@bluewallet.com
                  </a>
                </div>
                <div>
                  <h3 className="text-sm font-medium mb-1">Press</h3>
                  <a href="mailto:press@bluewallet.com" className="text-sm text-sky-500 hover:underline">
                    press@bluewallet.com
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-card p-6">
            <form className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" placeholder="Your name" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="your@email.com" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input id="subject" placeholder="How can we help?" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <textarea
                  id="message"
                  className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Tell us more about your inquiry..."
                  required
                />
              </div>

              <Button type="submit" className="w-full">
                Send Message
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                By submitting this form, you agree to our Privacy Policy
              </p>
            </form>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/50 p-6 space-y-3">
          <h2 className="text-lg font-semibold">Frequently Asked Questions</h2>
          <div className="space-y-2">
            <details className="group">
              <summary className="cursor-pointer text-sm font-medium hover:text-sky-500">
                How long do transfers take?
              </summary>
              <p className="mt-2 text-sm text-muted-foreground pl-4">
                Most transfers complete within 1-3 business days, depending on your bank's processing time.
              </p>
            </details>
            <details className="group">
              <summary className="cursor-pointer text-sm font-medium hover:text-sky-500">
                What are your fees?
              </summary>
              <p className="mt-2 text-sm text-muted-foreground pl-4">
                We charge a 5% surcharge on transfers to cover operational costs and blockchain gas fees.
              </p>
            </details>
            <details className="group">
              <summary className="cursor-pointer text-sm font-medium hover:text-sky-500">
                Is my data secure?
              </summary>
              <p className="mt-2 text-sm text-muted-foreground pl-4">
                Yes, we use industry-leading encryption and secure infrastructure through Turnkey and AWS.
              </p>
            </details>
          </div>
        </div>
      </div>
    </main>
  );
}
