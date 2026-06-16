import * as Sentry from "@sentry/nextjs";

/**
 * Next.js instrumentation — runs once when the server boots. Validates env
 * configuration and initializes Sentry for the active runtime (both no-op when
 * unconfigured).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env");
    validateEnv();
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Forwards App Router server errors to Sentry (no-op without a DSN).
export const onRequestError = Sentry.captureRequestError;
