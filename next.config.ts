import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * Content-Security-Policy.
 *
 * Allowlists the third-party SDKs this app loads in the browser:
 *  - Persona (embedded KYC):   *.withpersona.com
 *  - Privy (auth/embedded wallet): *.privy.io + Cloudflare challenge frames
 * `unsafe-eval` is required by the Privy/wallet SDKs (wasm); `unsafe-inline`
 * covers Next's inline runtime + styled attributes. Everything else is locked
 * to 'self'. `frame-ancestors 'none'` blocks clickjacking.
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.withpersona.com https://*.privy.io",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "frame-src https://*.withpersona.com https://*.privy.io https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  [
    "connect-src 'self'",
    "https://*.withpersona.com",
    "https://*.privy.io",
    "https://api.bridge.xyz",
    "https://*.upstash.io",
    "wss://*.privy.io",
  ].join(" "),
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// Wrap with Sentry. Source-map upload only runs when SENTRY_AUTH_TOKEN + org/
// project are set (CI/release builds); otherwise this is a no-op at build time
// and the runtime SDK stays inert until a DSN is configured.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  widenClientFileUpload: true,
  disableLogger: true,
});
