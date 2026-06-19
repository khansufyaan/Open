import { z } from "zod";

import { log } from "@/lib/observability";

/**
 * Typed, validated view of the environment. The app degrades gracefully when
 * integrations are unconfigured, so most vars are optional — but when present
 * they're format-checked, and partially-configured integrations are flagged at
 * boot (see instrumentation.ts) so misconfig surfaces loudly instead of as a
 * silent 500 later.
 */

const schema = z.object({
  // Privy (auth)
  NEXT_PUBLIC_PRIVY_APP_ID: z.string().min(1).optional(),
  PRIVY_APP_SECRET: z.string().min(1).optional(),
  PRIVY_VERIFICATION_KEY: z.string().optional(),

  // Bridge (custody / KYC / transfers)
  BRIDGE_API_KEY: z.string().min(1).optional(),
  BRIDGE_API_BASE_URL: z.string().url().optional(),
  BRIDGE_DEFAULT_CHAIN: z.string().optional(),
  BRIDGE_TRANSFER_CURRENCY: z.string().optional(),
  BRIDGE_DEMO_AUTOAPPROVE: z.enum(["true", "false"]).optional(),

  // KV / Upstash (persistence, rate limiting, audit)
  KV_REST_API_URL: z.string().url().optional(),
  KV_REST_API_TOKEN: z.string().min(1).optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),

  // Persona (embedded KYC)
  NEXT_PUBLIC_PERSONA_TEMPLATE_ID: z.string().optional(),
  NEXT_PUBLIC_PERSONA_ENVIRONMENT_ID: z.string().optional(),

  // Sentry (observability) — all optional; SDK no-ops without a DSN.
  SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Don't crash — log the specific field issues and fall back to raw values.
    log.warn("env:validation_failed", { issues: parsed.error.issues });
    cached = process.env as unknown as Env;
    return cached;
  }
  cached = parsed.data;
  return cached;
}

/** Warn when an integration is half-configured (one of a required pair set). */
export function validateEnv(): void {
  const e = getEnv();
  const pairs: Array<[string, boolean, boolean]> = [
    ["Privy", Boolean(e.NEXT_PUBLIC_PRIVY_APP_ID), Boolean(e.PRIVY_APP_SECRET)],
    [
      "KV",
      Boolean(e.KV_REST_API_URL ?? e.UPSTASH_REDIS_REST_URL),
      Boolean(e.KV_REST_API_TOKEN ?? e.UPSTASH_REDIS_REST_TOKEN),
    ],
    [
      "Persona",
      Boolean(e.NEXT_PUBLIC_PERSONA_TEMPLATE_ID),
      Boolean(e.NEXT_PUBLIC_PERSONA_ENVIRONMENT_ID),
    ],
  ];
  for (const [name, a, b] of pairs) {
    if (a !== b) {
      log.warn("env:partial_config", {
        integration: name,
        message: `${name} is only partially configured — both values are required.`,
      });
    }
  }
}
