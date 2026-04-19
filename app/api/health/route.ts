export const runtime = "nodejs";

import { NextResponse } from "next/server";
import Redis from "ioredis";

/**
 * GET /api/health — returns 200 with a Redis PING roundtrip.
 *
 * Used by:
 *   - Vercel's periodic health checks
 *   - The portfolio's url-health-check GitHub Action
 *   - Ops dashboards that care "is the service alive"
 *
 * Redis PING is the main signal — if Redis is dead, the webhook
 * idempotency guard is dead, and the app is unusable even if the
 * Next.js server responds.
 */
export async function GET() {
  const startedAt = Date.now();
  const url = process.env.REDIS_URL;
  if (!url) {
    return NextResponse.json(
      { ok: false, error: "REDIS_URL not configured" },
      { status: 503 }
    );
  }

  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    const pong = await redis.ping();
    await redis.quit();
    return NextResponse.json({
      ok: pong === "PONG",
      redis: pong,
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    try {
      await redis.quit();
    } catch {
      /* swallow */
    }
    return NextResponse.json(
      { ok: false, error: message },
      { status: 503 }
    );
  }
}
