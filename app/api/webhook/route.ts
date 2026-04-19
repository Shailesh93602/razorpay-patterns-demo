export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { verifyWebhookSignature, extractEventId } from "@/lib/razorpay";
import { claimEvent } from "@/lib/idempotency";

/**
 * Razorpay webhook handler.
 *
 * Flow (mirrors stripe-payments-demo's /api/webhook):
 *   1. Read the RAW body (must be bytes-exact for HMAC to match)
 *   2. Verify X-Razorpay-Signature against HMAC-SHA256(body, webhookSecret)
 *      — reject 400 if invalid
 *   3. Derive a stable event-id from the payload entity (payment/order/etc.)
 *      — Razorpay doesn't provide a top-level event.id the way Stripe does
 *   4. SETNX `razorpay:event:{eventId}` with 24h TTL
 *      — duplicate delivery? return 200 with { duplicate: true }, skip handler
 *      — first delivery? run the handler, return 200
 *
 * Razorpay retries non-2xx up to 24 hours. TTL matches that window so we
 * dedup every retry without leaking keys forever.
 */
export async function POST(request: Request) {
  const headerSig = request.headers.get("x-razorpay-signature");
  if (!headerSig) {
    return NextResponse.json(
      { error: "Missing X-Razorpay-Signature header" },
      { status: 400 }
    );
  }

  const rawBody = await request.text();

  let signatureValid = false;
  try {
    signatureValid = verifyWebhookSignature(rawBody, headerSig);
  } catch (err) {
    console.error("Webhook signature verification error:", err);
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  if (!signatureValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const eventId = extractEventId(payload);
  const eventType = (payload.event as string | undefined) ?? "unknown";

  const claimed = await claimEvent(`event:${eventId}`);
  if (!claimed) {
    // Second+ delivery of the same event — Razorpay is retrying.
    // Return 200 so Razorpay stops retrying; DO NOT re-run the handler.
    return NextResponse.json({
      ok: true,
      duplicate: true,
      eventId,
      eventType,
    });
  }

  // First time seeing this event — dispatch.
  await dispatch(eventType, payload);

  return NextResponse.json({
    ok: true,
    duplicate: false,
    eventId,
    eventType,
  });
}

async function dispatch(eventType: string, payload: Record<string, unknown>) {
  // Placeholder dispatch table. Production integrations (KhataGO,
  // EduScale) will swap this for real handlers writing to Prisma.
  switch (eventType) {
    case "payment.captured":
    case "order.paid":
    case "subscription.activated":
    case "subscription.charged":
    case "payment.failed":
    case "refund.processed":
      console.log(`Razorpay event ${eventType} processed`, {
        hasPayload: Boolean(payload),
      });
      return;
    default:
      console.log(`Razorpay event ${eventType} received (no-op)`, {
        hasPayload: Boolean(payload),
      });
  }
}
