import type { ReactNode } from "react";

export default function HomePage(): ReactNode {
  return (
    <main
      style={{
        maxWidth: 780,
        margin: "0 auto",
        padding: "3rem 1.5rem",
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ fontSize: "2rem", marginBottom: "0.25rem" }}>
        razorpay-patterns-demo
      </h1>
      <p style={{ opacity: 0.75, marginTop: 0 }}>
        Razorpay webhook idempotency + retry patterns. India-accessible
        mirror of{" "}
        <a
          href="https://github.com/Shailesh93602/stripe-payments-demo"
          style={{ color: "#93c5fd" }}
        >
          stripe-payments-demo
        </a>
        .
      </p>

      <h2 style={{ marginTop: "2rem" }}>Endpoints</h2>
      <ul>
        <li>
          <code>POST /api/webhook</code> — Razorpay webhook receiver. Verifies
          the <code>X-Razorpay-Signature</code> header (HMAC-SHA256 of the raw
          body with your webhook secret), then runs a Redis SETNX guard with
          a 24h TTL on the payment/order/subscription entity ID so duplicate
          deliveries short-circuit before the handler runs.
        </li>
        <li>
          <code>POST /api/order</code> — creates a Razorpay Order with a
          caller-supplied <code>receipt</code> string (idempotency key).
          Exponential-backoff retry on 5xx / network errors; no retry on
          4xx (invalid amount, duplicate receipt, etc.).
        </li>
        <li>
          <code>GET /api/health</code> — Redis PING liveness probe.
        </li>
      </ul>

      <h2 style={{ marginTop: "2rem" }}>Sequence</h2>
      <pre
        style={{
          background: "#111827",
          color: "#e5e7eb",
          padding: "1rem",
          borderRadius: 8,
          overflowX: "auto",
          fontSize: 13,
        }}
      >{`Razorpay -> POST /api/webhook
  verify X-Razorpay-Signature (HMAC-SHA256 of raw body)
    invalid -> 400
    valid   -> extract eventId from payload.payment.entity.id (etc.)
            -> SETNX razorpay:event:{eventId} EX 86400
                  duplicate -> 200 { duplicate: true }  [no-op]
                  new       -> dispatch by event.type -> 200`}</pre>

      <h2 style={{ marginTop: "2rem" }}>Why this exists</h2>
      <p>
        Razorpay retries webhooks on non-2xx for up to 24 hours. Without an
        idempotency guard, every retry would re-fire whatever side-effects
        the handler does — duplicate database writes, duplicate emails,
        duplicate grants of paid access. The SETNX guard is a single atomic
        operation that makes the whole flow exactly-once from the business
        logic's perspective, even though the transport is at-least-once.
      </p>
      <p>
        The pattern is identical to Stripe&apos;s: only the signing scheme
        differs (Razorpay uses straight HMAC-SHA256 of the body; Stripe adds
        a timestamp and structured <code>Stripe-Signature</code> header).
        Both demos share <code>lib/idempotency.ts</code> and{" "}
        <code>lib/retry.ts</code> in spirit — copy once, adapt signature
        verification, done.
      </p>

      <p style={{ marginTop: "2rem", opacity: 0.7, fontSize: 14 }}>
        Source:{" "}
        <a
          href="https://github.com/Shailesh93602/razorpay-patterns-demo"
          style={{ color: "#93c5fd" }}
        >
          github.com/Shailesh93602/razorpay-patterns-demo
        </a>
      </p>
    </main>
  );
}
