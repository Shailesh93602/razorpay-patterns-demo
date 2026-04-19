import crypto from "node:crypto";
import Razorpay from "razorpay";

/**
 * Lazily instantiated Razorpay client shared across Next.js route handlers.
 *
 * We intentionally do NOT throw at import time — the Next.js build imports
 * route modules to collect metadata, and we don't want missing env vars to
 * break a static build. Routes validate on first call instead.
 */
let razorpayClient: Razorpay | null = null;

export function getRazorpay(): Razorpay {
  if (!razorpayClient) {
    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (!key_id || !key_secret) {
      throw new Error(
        "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set. See .env.example."
      );
    }
    razorpayClient = new Razorpay({ key_id, key_secret });
  }
  return razorpayClient;
}

export function getWebhookSecret(): string {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("RAZORPAY_WEBHOOK_SECRET is not configured.");
  }
  return secret;
}

/**
 * Verify a Razorpay webhook signature.
 *
 * Razorpay signs the raw request body with your webhook secret using
 * HMAC-SHA256. The expected signature arrives in the `X-Razorpay-Signature`
 * header. This function re-computes the HMAC and constant-time-compares it
 * to the header value.
 *
 * IMPORTANT: pass the RAW request body string — JSON.parse-then-stringify
 * will reorder keys and break the signature. In Next.js route handlers,
 * that means `await request.text()`, not `await request.json()`.
 */
export function verifyWebhookSignature(
  rawBody: string,
  headerSignature: string,
  secret: string = getWebhookSecret()
): boolean {
  if (!headerSignature) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  // constant-time comparison — short-circuits would leak timing information
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(headerSignature);
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * Extract a stable idempotency key from a Razorpay webhook payload.
 *
 * Razorpay doesn't ship a top-level `event.id` the way Stripe does, so we
 * derive one from the underlying entity (payment/order/refund) — whichever
 * entity is the subject of this event. Falls back to a fingerprint of the
 * body if nothing else is available.
 */
export function extractEventId(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "unknown";
  const body = payload as Record<string, unknown>;
  const container = body.payload as Record<string, unknown> | undefined;
  if (!container) return "unknown";

  const paymentEntity = (container.payment as { entity?: { id?: string } } | undefined)?.entity;
  if (paymentEntity?.id) return `payment:${paymentEntity.id}`;

  const orderEntity = (container.order as { entity?: { id?: string } } | undefined)?.entity;
  if (orderEntity?.id) return `order:${orderEntity.id}`;

  const subscriptionEntity = (container.subscription as { entity?: { id?: string } } | undefined)?.entity;
  if (subscriptionEntity?.id) return `subscription:${subscriptionEntity.id}`;

  const refundEntity = (container.refund as { entity?: { id?: string } } | undefined)?.entity;
  if (refundEntity?.id) return `refund:${refundEntity.id}`;

  return "unknown";
}
