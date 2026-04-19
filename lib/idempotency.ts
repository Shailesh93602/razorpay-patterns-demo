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
 */

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error("REDIS_URL is not configured.");
    }
    redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  return redis;
}

export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

export async function claimEvent(
  key: string,
  ttlSeconds: number = IDEMPOTENCY_TTL_SECONDS
): Promise<boolean> {
  const client = getRedis();
  const result = await client.set(`razorpay:${key}`, "1", "EX", ttlSeconds, "NX");
  return result === "OK";
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
