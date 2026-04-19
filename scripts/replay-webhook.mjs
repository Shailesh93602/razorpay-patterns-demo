#!/usr/bin/env node
/**
 * replay-webhook.mjs
 *
 * Fires a signed fake Razorpay webhook at the local /api/webhook so
 * you can demo idempotency without a real Razorpay transaction:
 *
 *   1. Generate a payment.captured event body with a random payment ID
 *   2. HMAC-SHA256 the body with RAZORPAY_WEBHOOK_SECRET
 *   3. POST to http://localhost:3000/api/webhook
 *   4. POST it AGAIN with the same payment ID
 *      → server logs `duplicate: true` on the second call
 *
 * Useful for:
 *   - Recorded Loom walkthroughs
 *   - CI smoke tests
 *   - Pair-programming demos
 *
 * Run: RAZORPAY_WEBHOOK_SECRET=yoursecret node scripts/replay-webhook.mjs
 */
import crypto from "node:crypto";

const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
const url = process.env.WEBHOOK_URL ?? "http://localhost:3000/api/webhook";

if (!secret) {
  console.error(
    "RAZORPAY_WEBHOOK_SECRET is required. Check .env.example for how to get one."
  );
  process.exit(1);
}

function buildEvent(paymentId) {
  return {
    entity: "event",
    account_id: "acc_test_replay",
    event: "payment.captured",
    contains: ["payment"],
    payload: {
      payment: {
        entity: {
          id: paymentId,
          entity: "payment",
          amount: 9900,
          currency: "INR",
          status: "captured",
          order_id: `order_${paymentId.slice(-10)}`,
          method: "upi",
          captured: true,
          created_at: Math.floor(Date.now() / 1000),
        },
      },
    },
    created_at: Math.floor(Date.now() / 1000),
  };
}

async function fire(paymentId, label) {
  const body = JSON.stringify(buildEvent(paymentId));
  const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-razorpay-signature": signature,
    },
    body,
  });
  const json = await res.json();
  console.log(`[${label}]`, res.status, json);
  return json;
}

const paymentId = `pay_replay_${crypto.randomBytes(6).toString("hex")}`;
console.log(`Replaying payment.captured for ${paymentId}`);
console.log(`Target: ${url}\n`);

await fire(paymentId, "1st delivery");
await new Promise((r) => setTimeout(r, 500));
await fire(paymentId, "2nd delivery (should be duplicate)");
