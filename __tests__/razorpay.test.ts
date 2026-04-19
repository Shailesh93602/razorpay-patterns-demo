import crypto from "node:crypto";

import { verifyWebhookSignature, extractEventId } from "@/lib/razorpay";

describe("verifyWebhookSignature", () => {
  const secret = "test_webhook_secret_xyz";
  const body = JSON.stringify({ event: "payment.captured", payload: {} });
  const validSig = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  it("accepts a valid signature", () => {
    expect(verifyWebhookSignature(body, validSig, secret)).toBe(true);
  });

  it("rejects a tampered signature", () => {
    const tampered = validSig.slice(0, -1) + "0";
    expect(verifyWebhookSignature(body, tampered, secret)).toBe(false);
  });

  it("rejects a signature computed with a different secret", () => {
    const otherSig = crypto
      .createHmac("sha256", "different_secret")
      .update(body)
      .digest("hex");
    expect(verifyWebhookSignature(body, otherSig, secret)).toBe(false);
  });

  it("rejects an empty signature header", () => {
    expect(verifyWebhookSignature(body, "", secret)).toBe(false);
  });

  it("rejects when body is tampered after signing", () => {
    const tamperedBody = body + " ";
    expect(verifyWebhookSignature(tamperedBody, validSig, secret)).toBe(false);
  });

  it("rejects when signature length differs from expected", () => {
    expect(verifyWebhookSignature(body, "abcd", secret)).toBe(false);
  });
});

describe("extractEventId", () => {
  it("extracts payment id when event is a payment event", () => {
    const id = extractEventId({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_abc123" } } },
    });
    expect(id).toBe("payment:pay_abc123");
  });

  it("extracts order id when event is an order event", () => {
    const id = extractEventId({
      event: "order.paid",
      payload: { order: { entity: { id: "order_xyz" } } },
    });
    expect(id).toBe("order:order_xyz");
  });

  it("extracts subscription id when present", () => {
    const id = extractEventId({
      event: "subscription.activated",
      payload: { subscription: { entity: { id: "sub_123" } } },
    });
    expect(id).toBe("subscription:sub_123");
  });

  it("extracts refund id when present", () => {
    const id = extractEventId({
      event: "refund.processed",
      payload: { refund: { entity: { id: "rfnd_999" } } },
    });
    expect(id).toBe("refund:rfnd_999");
  });

  it("prefers payment over order when both exist", () => {
    const id = extractEventId({
      event: "order.paid",
      payload: {
        payment: { entity: { id: "pay_abc" } },
        order: { entity: { id: "order_xyz" } },
      },
    });
    expect(id).toBe("payment:pay_abc");
  });

  it("returns 'unknown' for an unrecognized shape", () => {
    expect(extractEventId({ event: "something", payload: {} })).toBe("unknown");
    expect(extractEventId({})).toBe("unknown");
    expect(extractEventId(null)).toBe("unknown");
  });
});
