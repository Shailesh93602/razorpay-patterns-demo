export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { getRazorpay } from "@/lib/razorpay";
import { withRetry } from "@/lib/retry";

/**
 * POST /api/create-order
 *
 * Creates a Razorpay order for the Razorpay Standard Web Checkout flow.
 * Contract matches what Razorpay's integration docs describe:
 *   request  → { amount: paise, currency: "INR", receipt?: string }
 *   response → { order_id, amount, currency }
 *
 * Notes:
 *   - Minimum amount is 100 paise (INR ₹1). Razorpay will reject anything
 *     smaller with a 400.
 *   - receipt is the caller-supplied idempotency key. If omitted we generate
 *     a UUID so client-side double-clicks can't create two orders with the
 *     same amount — Razorpay rejects duplicate receipts.
 *   - 5xx / network errors are retried with exponential backoff; 4xx
 *     (invalid amount, duplicate receipt, auth failures) fail fast.
 *
 * This is the "client initiates" side of the flow. The async webhook at
 * /api/webhook is the authoritative source of truth for billing state —
 * don't trust the client callback alone.
 */
export async function POST(request: Request) {
  let body: {
    amount?: number;
    currency?: string;
    receipt?: string;
    notes?: Record<string, string>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { amount, currency = "INR", notes } = body;
  const receipt = body.receipt ?? `rcpt_${randomUUID()}`;

  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return NextResponse.json(
      { error: "amount is required (integer paise, minimum 100)" },
      { status: 400 }
    );
  }
  if (amount < 100) {
    return NextResponse.json(
      { error: "amount must be at least 100 paise (₹1)" },
      { status: 400 }
    );
  }
  if (!Number.isInteger(amount)) {
    return NextResponse.json(
      { error: "amount must be an integer (paise). For ₹1 send 100." },
      { status: 400 }
    );
  }

  try {
    const razorpay = getRazorpay();
    const order = await withRetry(() =>
      razorpay.orders.create({
        amount,
        currency,
        receipt,
        notes,
      })
    );

    return NextResponse.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const statusCode =
      (error as { statusCode?: number })?.statusCode ??
      (error as { status?: number })?.status;

    // Razorpay auth failure
    if (statusCode === 401) {
      return NextResponse.json(
        { error: "Razorpay authentication failed. Check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET." },
        { status: 401 }
      );
    }

    console.error("Razorpay order.create failed:", { message, statusCode });
    return NextResponse.json(
      { error: `Failed to create order: ${message}` },
      { status: 500 }
    );
  }
}
