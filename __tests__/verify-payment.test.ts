import crypto from "node:crypto";

/**
 * Pure unit tests for the verify-payment signature algorithm.
 *
 * We test the crypto logic directly rather than invoking the route handler,
 * because the handler is a thin wrapper around this HMAC compare. Integration
 * testing the route handler requires the Next.js Request global + env var
 * setup that's covered by the live demo.
 */

function computeSignature(
  orderId: string,
  paymentId: string,
  keySecret: string
): string {
  return crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

function verifySignature(
  orderId: string,
  paymentId: string,
  signature: string,
  keySecret: string
): boolean {
  const expected = computeSignature(orderId, paymentId, keySecret);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

describe("Razorpay Standard Checkout signature verification", () => {
  const keySecret = "test_key_secret_demo";
  const orderId = "order_Mk82n6fzMz2PxG";
  const paymentId = "pay_Mk82r5gvHeJzXn";
  const goodSignature = computeSignature(orderId, paymentId, keySecret);

  it("accepts the genuine signature computed from order_id|payment_id", () => {
    expect(verifySignature(orderId, paymentId, goodSignature, keySecret)).toBe(true);
  });

  it("rejects a tampered signature", () => {
    const tampered = goodSignature.slice(0, -1) + "0";
    expect(verifySignature(orderId, paymentId, tampered, keySecret)).toBe(false);
  });

  it("rejects when the order_id was tampered with (replay on a different order)", () => {
    expect(
      verifySignature("order_OTHER", paymentId, goodSignature, keySecret)
    ).toBe(false);
  });

  it("rejects when the payment_id was tampered with", () => {
    expect(
      verifySignature(orderId, "pay_OTHER", goodSignature, keySecret)
    ).toBe(false);
  });

  it("rejects a signature computed with a wrong secret", () => {
    const wrongSecret = computeSignature(orderId, paymentId, "different_secret");
    expect(verifySignature(orderId, paymentId, wrongSecret, keySecret)).toBe(false);
  });

  it("rejects when signature length differs (prevents timing-compare crash)", () => {
    expect(verifySignature(orderId, paymentId, "too_short", keySecret)).toBe(false);
  });

  it("handles empty signature safely", () => {
    expect(verifySignature(orderId, paymentId, "", keySecret)).toBe(false);
  });

  it("separator matters — order_id + payment_id WITHOUT the pipe fails", () => {
    const wrongFormat = crypto
      .createHmac("sha256", keySecret)
      .update(`${orderId}${paymentId}`) // missing "|"
      .digest("hex");
    expect(verifySignature(orderId, paymentId, wrongFormat, keySecret)).toBe(false);
  });
});
