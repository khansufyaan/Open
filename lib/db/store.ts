import { Redis } from "@upstash/redis";

import type { UserRecord } from "@/types/user";

/**
 * User persistence backed by Vercel KV / Upstash Redis (REST).
 *
 * Reads the standard env vars injected by the Vercel KV integration
 * (`KV_REST_API_URL` / `KV_REST_API_TOKEN`) or the native Upstash names
 * (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`). When neither is set
 * (local dev without KV), it falls back to a per-process in-memory map so the
 * app still runs — but that store is NOT durable across serverless invocations,
 * so production must configure KV.
 */

const USER_PREFIX = "user:";

let redis: Redis | null = null;
let warnedUnconfigured = false;

function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn(
        "[Store] KV is not configured (KV_REST_API_URL / KV_REST_API_TOKEN missing) — " +
          "falling back to a non-persistent in-memory store. Set up Vercel KV for production."
      );
    }
    return null;
  }

  if (!redis) {
    redis = new Redis({ url, token });
  }
  return redis;
}

export function isStoreConfigured(): boolean {
  return Boolean(
    (process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL) &&
      (process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN)
  );
}

// Non-persistent fallback for local dev / preview without KV.
const memory = new Map<string, UserRecord>();

export async function getUser(userId: string): Promise<UserRecord | null> {
  const client = getRedis();
  if (!client) {
    return memory.get(userId) ?? null;
  }
  const record = await client.get<UserRecord>(USER_PREFIX + userId);
  return record ?? null;
}

export async function saveUser(record: UserRecord): Promise<void> {
  const client = getRedis();
  if (!client) {
    memory.set(record.userId, record);
    return;
  }
  await client.set(USER_PREFIX + record.userId, record);
}

/**
 * Read-modify-write a user record. Creates the record if it doesn't exist.
 * `userId` and `updatedAt` are always authoritative on the result.
 */
export async function updateUser(
  userId: string,
  patch: Partial<UserRecord>
): Promise<UserRecord> {
  const now = new Date().toISOString();
  const existing = await getUser(userId);

  const next: UserRecord = {
    createdAt: now,
    ...(existing ?? {}),
    ...patch,
    userId,
    updatedAt: now,
  };

  await saveUser(next);
  return next;
}
