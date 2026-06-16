import { Redis } from "@upstash/redis";

import { log } from "@/lib/observability";

/**
 * Append-only audit trail for sensitive events (money movement, KYC state
 * changes, card issuance). Entries are structured-logged and, when KV is
 * configured, appended to a per-user Redis list capped to a recent window.
 *
 * This is intentionally best-effort: auditing must never block or fail the
 * user-facing operation.
 */

const AUDIT_PREFIX = "audit:";
const MAX_ENTRIES = 500;

let redis: Redis | null = null;
function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (!redis) redis = new Redis({ url, token });
  return redis;
}

export type AuditEvent = {
  /** The verified Privy DID the event belongs to. */
  userId: string;
  /** e.g. "send.submitted", "kyc.approved", "card.issued". */
  action: string;
  /** Non-sensitive structured detail. Never include PANs/secrets. */
  detail?: Record<string, unknown>;
};

export async function recordAudit(event: AuditEvent): Promise<void> {
  const entry = { ...event, ts: new Date().toISOString() };
  log.info(`audit:${event.action}`, entry as Record<string, unknown>);

  try {
    const client = getRedis();
    if (!client) return;
    const key = AUDIT_PREFIX + event.userId;
    await client.lpush(key, JSON.stringify(entry));
    await client.ltrim(key, 0, MAX_ENTRIES - 1);
  } catch (error) {
    // Auditing is best-effort — never surface a failure to the caller.
    log.warn("audit:persist_failed", {
      action: event.action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
