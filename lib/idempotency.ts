import Redis from "ioredis";

/**
 * SETNX-based idempotency guard.
 *
 * claimEvent() returns true on FIRST claim (processed this event) and
 * false on subsequent calls with the same key (duplicate delivery).
 *
 * Razorpay retries webhooks up to 24 hours on non-2xx — matching the
 * TTL to 24h means every retry bucket gets deduplicated without
 * stranding keys forever.
 *
 * Redis backend is used when REDIS_URL is configured (production).
 * When absent, a per-instance in-memory Map with TTL expiry is used
 * so the demo still works on Vercel without an Upstash add-on.
 * The in-memory fallback is per-function-instance and NOT safe for
 * multi-region or high-scale production — real integrations
 * (KhataGO, EduScale) must set REDIS_URL.
 */

let redis: Redis | null = null;

const memoryStore = new Map<string, number>();

function getRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!redis) {
    redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  return redis;
}

function memoryClaim(fullKey: string, ttlSeconds: number): boolean {
  const now = Date.now();
  const expiresAt = memoryStore.get(fullKey);
  if (expiresAt && expiresAt > now) {
    return false;
  }
  memoryStore.set(fullKey, now + ttlSeconds * 1000);
  if (memoryStore.size > 1024) {
    for (const [k, exp] of memoryStore) {
      if (exp <= now) memoryStore.delete(k);
    }
  }
  return true;
}

export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

export async function claimEvent(
  key: string,
  ttlSeconds: number = IDEMPOTENCY_TTL_SECONDS
): Promise<boolean> {
  const fullKey = `razorpay:${key}`;
  const client = getRedis();
  if (!client) {
    return memoryClaim(fullKey, ttlSeconds);
  }
  const result = await client.set(fullKey, "1", "EX", ttlSeconds, "NX");
  return result === "OK";
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

export function __resetMemoryStoreForTests(): void {
  memoryStore.clear();
}
