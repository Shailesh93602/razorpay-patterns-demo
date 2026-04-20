import type { Metadata } from "next";
import DemoClient from "./DemoClient";

export const metadata: Metadata = {
  title: "Razorpay Standard Checkout demo",
  description:
    "Interactive test of the Razorpay Standard Checkout flow — create-order → Checkout.js → verify-payment.",
};

export default function DemoPage() {
  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "";

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
        Razorpay Standard Checkout — live demo
      </h1>
      <p style={{ opacity: 0.75, marginTop: 0 }}>
        Click Pay, complete the Razorpay test flow, and watch the three-step
        integration run end-to-end: create-order → Checkout.js modal →
        verify-payment signature check.
      </p>

      <DemoClient razorpayKeyId={keyId} />

      <section style={{ marginTop: "3rem" }}>
        <h2>How to test (test mode only)</h2>
        <p style={{ opacity: 0.85 }}>
          <strong>Don&apos;t scan the QR with a real UPI app.</strong> Test-mode
          orders aren&apos;t registered on the live UPI network, so GPay /
          PhonePe / Paytm will say <em>&quot;invalid UPI id.&quot;</em> Use the
          test credentials below inside the Razorpay modal instead.
        </p>

        <h3 style={{ marginTop: "1.5rem", fontSize: "1rem" }}>Card tab</h3>
        <p style={{ fontSize: 14, opacity: 0.85 }}>
          Razorpay test accounts have International Payments disabled by
          default. The old <code>4111 1111 1111 1111</code> number gets
          classified as international and rejected with{" "}
          <em>&quot;International cards are not supported.&quot;</em> Use the{" "}
          <strong>domestic</strong> test cards below instead.
        </p>
        <pre
          style={{
            background: "#111827",
            color: "#e5e7eb",
            padding: "1rem",
            borderRadius: 8,
            fontSize: 13,
          }}
        >{`Card number   5267 3181 8797 5449   (Mastercard, domestic INR)
              4386 2894 0766 0153   (Visa, domestic INR)
Expiry        any future date (e.g. 12/30)
CVV           any 3 digits (e.g. 123)
Name          any
OTP           1111 (shown in the modal — NOT a real SMS)`}</pre>
        <p style={{ fontSize: 13, opacity: 0.7 }}>
          If you get a real SMS OTP on your phone during test mode, that&apos;s
          a coincidental Razorpay account notification, not this payment —
          nothing is actually charged.
        </p>

        <h3 style={{ marginTop: "1.5rem", fontSize: "1rem" }}>UPI tab</h3>
        <p style={{ fontSize: 14, opacity: 0.85 }}>
          <strong>Type</strong> one of these into the UPI ID field
          (don&apos;t scan):
        </p>
        <pre
          style={{
            background: "#111827",
            color: "#e5e7eb",
            padding: "1rem",
            borderRadius: 8,
            fontSize: 13,
          }}
        >{`success@razorpay   → payment.captured
failure@razorpay   → payment.failed`}</pre>

        <p style={{ opacity: 0.75, fontSize: 14, marginTop: "1rem" }}>
          Nothing is actually charged. See{" "}
          <a
            href="https://razorpay.com/docs/payments/payments/test-card-details/"
            style={{ color: "#93c5fd" }}
          >
            Razorpay test card docs
          </a>{" "}
          and{" "}
          <a
            href="https://razorpay.com/docs/payments/payments/test-card-details/#test-upi-id"
            style={{ color: "#93c5fd" }}
          >
            test UPI IDs
          </a>
          .
        </p>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>What happens when you click Pay</h2>
        <ol>
          <li>
            Frontend calls <code>POST /api/create-order</code> with{" "}
            <code>{`{ amount: 100, currency: "INR", receipt: "..." }`}</code>.
            Backend calls Razorpay API, returns{" "}
            <code>{`{ order_id, amount, currency }`}</code>.
          </li>
          <li>
            Frontend opens Razorpay Checkout.js modal with the{" "}
            <code>order_id</code> + your <code>NEXT_PUBLIC_RAZORPAY_KEY_ID</code>.
          </li>
          <li>
            You complete the test payment. Razorpay calls the Checkout.js{" "}
            <code>handler</code> with <code>razorpay_order_id</code>,{" "}
            <code>razorpay_payment_id</code>, and <code>razorpay_signature</code>.
          </li>
          <li>
            Frontend forwards those three to <code>POST /api/verify-payment</code>.
            Backend recomputes HMAC-SHA256(<code>order_id|payment_id</code>,{" "}
            <code>KEY_SECRET</code>) and constant-time compares. Returns{" "}
            <code>{`{ ok: true, verified: true }`}</code> or 400.
          </li>
          <li>
            In parallel, Razorpay fires the async webhook at{" "}
            <code>/api/webhook</code> (authoritative source for billing state —
            frontend verification is a UX gate, the webhook flips the DB).
          </li>
        </ol>
      </section>
    </main>
  );
}
