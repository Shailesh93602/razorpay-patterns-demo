export const runtime = "nodejs";

import crypto from "node:crypto";
import { NextResponse } from "next/server";

/**
 * POST /api/verify-payment
 *
 * Client-callback signature verification for Razorpay Standard Checkout.
 *
 * When the customer completes payment in the Checkout.js modal, Razorpay
 * calls the frontend's success handler with three values:
 *   - razorpay_order_id
 *   - razorpay_payment_id
 *   - razorpay_signature
 *
 * The signature is HMAC-SHA256 of `{order_id}|{payment_id}` using the
 * merchant's KEY_SECRET. Verifying this on the server proves the
 * frontend response wasn't forged or replayed — an attacker calling
 * "payment complete!" without actually paying won't have a valid
 * signature.
 *
 * This is separate from the webhook signature (which signs the raw
 * event body). Both exist for different trust boundaries:
 *   - /api/verify-payment: client → server immediate confirmation
 *   - /api/webhook: Razorpay → server async authoritative notification
 *
 * Production architecture uses BOTH — frontend shows "payment
 * successful" after verify-payment returns 200, but billing state
 * only flips to "paid" when the webhook fires (webhook is the source
 * of truth, frontend is UX).
 */
export async function POST(request: Request) {
  let body: {
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json(
      {
        error:
          "Missing required fields: razorpay_order_id, razorpay_payment_id, razorpay_signature",
      },
      { status: 400 }
    );
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    return NextResponse.json(
      { error: "RAZORPAY_KEY_SECRET is not configured" },
      { status: 500 }
    );
  }

  // Razorpay signs `{order_id}|{payment_id}` with KEY_SECRET using HMAC-SHA256.
  // Not the webhook secret — the KEY_SECRET (the one paired with KEY_ID).
  const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(payload)
    .digest("hex");

  const expectedBuf = Buffer.from(expectedSignature);
  const actualBuf = Buffer.from(razorpay_signature);

  if (expectedBuf.length !== actualBuf.length) {
    return NextResponse.json(
      { ok: false, error: "Signature length mismatch" },
      { status: 400 }
    );
  }

  const valid = crypto.timingSafeEqual(expectedBuf, actualBuf);
  if (!valid) {
    return NextResponse.json(
      { ok: false, error: "Signature mismatch — payment not verified" },
      { status: 400 }
    );
  }

  // Client-side verification succeeded. DO NOT mark as paid here; wait for
  // the webhook at /api/webhook to fire (async, authoritative). This
  // endpoint only confirms "the client response is legit, not forged".
  return NextResponse.json({
    ok: true,
    verified: true,
    razorpay_order_id,
    razorpay_payment_id,
  });
}
