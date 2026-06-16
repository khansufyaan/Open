/**
 * Next.js instrumentation — runs once when the server boots. We use it to
 * validate environment configuration so misconfiguration is surfaced loudly at
 * startup instead of as a confusing runtime failure later.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env");
    validateEnv();
  }
}
