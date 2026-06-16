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

/* -------------------------------------------------------------------------- */
/*                          Per-user write serialization                       */
/* -------------------------------------------------------------------------- */

const LOCK_PREFIX = "lock:user:";
const LOCK_TTL_MS = 5000;
const LOCK_RETRY_MS = 50;
const LOCK_MAX_WAIT_MS = 4000;

// In-process serialization tail per user — covers the in-memory fallback and
// also collapses same-instance contention before hitting the Redis lock.
const localChains = new Map<string, Promise<unknown>>();

function runLocally<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const prev = localChains.get(userId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  // Keep the chain from rejecting future callers; swallow here, fn handles its own.
  localChains.set(
    userId,
    next.catch(() => undefined)
  );
  return next;
}

async function withRedisLock<T>(
  client: Redis,
  userId: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockKey = LOCK_PREFIX + userId;
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + LOCK_MAX_WAIT_MS;

  // Acquire via SET NX PX, retrying until the deadline.
  for (;;) {
    const acquired = await client.set(lockKey, token, { nx: true, px: LOCK_TTL_MS });
    if (acquired) break;
    if (Date.now() > deadline) {
      // Proceed without the lock rather than failing the user operation; the
      // TTL guarantees the held lock will expire shortly anyway.
      return fn();
    }
    await new Promise((r) => setTimeout(r, LOCK_RETRY_MS));
  }

  try {
    return await fn();
  } finally {
    // Release only if we still own it (best-effort; TTL is the backstop).
    try {
      const current = await client.get<string>(lockKey);
      if (current === token) await client.del(lockKey);
    } catch {
      /* TTL will reclaim it */
    }
  }
}

/**
 * Read-modify-write a user record atomically with respect to other writers.
 * Serializes concurrent updates per user (in-process chain + a Redis lock) so
 * patches can't clobber each other — important for the transactions list and
 * provisioning flags. Creates the record if it doesn't exist. `userId` and
 * `updatedAt` are always authoritative on the result.
 */
export async function updateUser(
  userId: string,
  patch: Partial<UserRecord> | ((current: UserRecord | null) => Partial<UserRecord>)
): Promise<UserRecord> {
  return runLocally(userId, async () => {
    const client = getRedis();
    const apply = async (): Promise<UserRecord> => {
      const now = new Date().toISOString();
      const existing = await getUser(userId);
      const resolvedPatch = typeof patch === "function" ? patch(existing) : patch;
      const next: UserRecord = {
        createdAt: now,
        ...(existing ?? {}),
        ...resolvedPatch,
        userId,
        updatedAt: now,
      };
      await saveUser(next);
      return next;
    };

    return client ? withRedisLock(client, userId, apply) : apply();
  });
}
