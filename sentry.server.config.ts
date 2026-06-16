import * as Sentry from "@sentry/nextjs";

/**
 * Server-side Sentry init. No-ops unless a DSN is configured, so the SDK is
 * inert in environments without observability set up.
 */
const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    // Don't capture request bodies / headers by default — this app handles PII.
    sendDefaultPii: false,
  });
}
