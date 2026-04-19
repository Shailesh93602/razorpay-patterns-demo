export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getRazorpay } from "@/lib/razorpay";
import { withRetry } from "@/lib/retry";

/**
 * Create a Razorpay Order with a caller-supplied `receipt` string, which
 * functions as an idempotency key — Razorpay rejects duplicate receipts
 * with an error, so a double-clicked "Pay" button can't create two
 * orders.
 *
 * Wraps the API call in our exponential-backoff retry so 5xx / network
 * errors are handled automatically while 4xx (invalid amount, dupe
 * receipt, etc.) fail fast.
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
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { amount, currency = "INR", receipt, notes } = body;
  if (typeof amount !== "number" || amount <= 0) {
    return NextResponse.json(
      { error: "amount must be a positive number (paise)" },
      { status: 400 }
    );
  }
  if (!receipt || typeof receipt !== "string") {
    return NextResponse.json(
      { error: "receipt is required for idempotency" },
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
    return NextResponse.json({ ok: true, order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
      (error as { statusCode?: number })?.statusCode ??
      (typeof (error as { status?: number })?.status === "number"
        ? (error as { status: number }).status
        : 502);
    console.error("Razorpay order.create failed:", { message, status });
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
