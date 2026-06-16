import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Per-user sliding-window rate limiting backed by Upstash. When KV isn't
 * configured (local dev) limiting is a no-op so the app still runs.
 *
 * Buckets are intentionally conservative on money/identity endpoints.
 */

let redis: Redis | null = null;
function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  if (!redis) redis = new Redis({ url, token });
  return redis;
}

const limiters = new Map<string, Ratelimit>();

export type RateBucket = "send" | "card" | "kyc" | "default";

const LIMITS: Record<RateBucket, { tokens: number; window: `${number} ${"s" | "m" | "h"}` }> = {
  send: { tokens: 10, window: "1 m" },
  card: { tokens: 5, window: "1 m" },
  kyc: { tokens: 8, window: "1 m" },
  default: { tokens: 30, window: "1 m" },
};

function getLimiter(bucket: RateBucket): Ratelimit | null {
  const client = getRedis();
  if (!client) return null;
  const existing = limiters.get(bucket);
  if (existing) return existing;
  const { tokens, window } = LIMITS[bucket];
  const limiter = new Ratelimit({
    redis: client,
    limiter: Ratelimit.slidingWindow(tokens, window),
    prefix: `rl:${bucket}`,
    analytics: false,
  });
  limiters.set(bucket, limiter);
  return limiter;
}

/**
 * Enforce the rate limit for a user+bucket. Returns a 429 NextResponse when the
 * limit is exceeded, or null when the request may proceed.
 */
export async function enforceRateLimit(
  bucket: RateBucket,
  identifier: string
): Promise<NextResponse | null> {
  const limiter = getLimiter(bucket);
  if (!limiter) return null; // No KV — limiting disabled.

  try {
    const { success, reset } = await limiter.limit(identifier);
    if (success) return null;
    const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    return NextResponse.json(
      { error: "RATE_LIMITED", message: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  } catch {
    // Fail open: a limiter outage shouldn't take down the endpoint.
    return null;
  }
}
