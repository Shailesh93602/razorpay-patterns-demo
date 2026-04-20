"use client";

import { useEffect, useState } from "react";

type Status =
  | { kind: "idle" }
  | { kind: "loading-script" }
  | { kind: "creating-order" }
  | { kind: "opening-modal"; orderId: string }
  | { kind: "verifying"; paymentId: string }
  | { kind: "verified"; paymentId: string; orderId: string }
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (response: unknown) => void) => void;
    };
  }
}

function loadCheckoutScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function DemoClient({ razorpayKeyId }: { razorpayKeyId: string }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [amountRupees, setAmountRupees] = useState(1);

  useEffect(() => {
    // Prefetch the script so the modal opens instantly when user clicks Pay
    void loadCheckoutScript();
  }, []);

  const missingKey = !razorpayKeyId;

  async function handlePay() {
    if (missingKey) {
      setStatus({
        kind: "error",
        message:
          "NEXT_PUBLIC_RAZORPAY_KEY_ID is not set. Add it to Vercel env vars and redeploy.",
      });
      return;
    }

    try {
      setStatus({ kind: "loading-script" });
      const ok = await loadCheckoutScript();
      if (!ok || !window.Razorpay) {
        setStatus({
          kind: "error",
          message: "Failed to load Razorpay Checkout.js script",
        });
        return;
      }

      setStatus({ kind: "creating-order" });
      const orderRes = await fetch("/api/create-order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amount: Math.round(amountRupees * 100), // rupees → paise
          currency: "INR",
        }),
      });
      if (!orderRes.ok) {
        const err = await orderRes.json().catch(() => ({}));
        setStatus({
          kind: "error",
          message: `create-order ${orderRes.status}: ${err.error ?? "unknown error"}`,
        });
        return;
      }
      const order = await orderRes.json();

      setStatus({ kind: "opening-modal", orderId: order.order_id });

      const razorpay = new window.Razorpay({
        key: razorpayKeyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.order_id,
        name: "razorpay-patterns-demo",
        description: "Standard Checkout demo payment",
        handler: async (response: unknown) => {
          const r = response as {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          };
          setStatus({ kind: "verifying", paymentId: r.razorpay_payment_id });
          const verifyRes = await fetch("/api/verify-payment", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              razorpay_order_id: r.razorpay_order_id,
              razorpay_payment_id: r.razorpay_payment_id,
              razorpay_signature: r.razorpay_signature,
            }),
          });
          if (!verifyRes.ok) {
            const err = await verifyRes.json().catch(() => ({}));
            setStatus({
              kind: "error",
              message: `verify-payment ${verifyRes.status}: ${err.error ?? "signature check failed"}`,
            });
            return;
          }
          setStatus({
            kind: "verified",
            paymentId: r.razorpay_payment_id,
            orderId: r.razorpay_order_id,
          });
        },
        modal: {
          ondismiss: () => setStatus({ kind: "cancelled" }),
        },
        theme: { color: "#93c5fd" },
      });

      razorpay.on("payment.failed", (response: unknown) => {
        const r = response as { error?: { description?: string; code?: string } };
        setStatus({
          kind: "error",
          message: `payment failed: ${r.error?.code ?? "unknown"} — ${r.error?.description ?? ""}`,
        });
      });

      razorpay.open();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus({ kind: "error", message });
    }
  }

  return (
    <div
      style={{
        marginTop: "2rem",
        padding: "1.5rem",
        border: "1px solid #334155",
        borderRadius: 12,
        background: "#111827",
      }}
    >
      {missingKey && (
        <p
          style={{
            background: "#991b1b",
            color: "white",
            padding: "0.75rem 1rem",
            borderRadius: 6,
            marginTop: 0,
          }}
        >
          NEXT_PUBLIC_RAZORPAY_KEY_ID env var is missing — demo won&apos;t
          work until it&apos;s set on Vercel (and KEY_SECRET on the server).
        </p>
      )}

      <label
        style={{
          display: "block",
          fontSize: 14,
          marginBottom: "0.5rem",
          opacity: 0.8,
        }}
      >
        Amount (₹)
      </label>
      <input
        type="number"
        min={1}
        max={100}
        value={amountRupees}
        onChange={(e) => setAmountRupees(Number(e.target.value) || 1)}
        style={{
          background: "#0b1020",
          color: "white",
          border: "1px solid #334155",
          padding: "0.5rem 0.75rem",
          borderRadius: 6,
          fontSize: 16,
          width: 120,
        }}
      />

      <div style={{ marginTop: "1rem" }}>
        <button
          onClick={handlePay}
          disabled={
            status.kind === "loading-script" ||
            status.kind === "creating-order" ||
            status.kind === "opening-modal" ||
            status.kind === "verifying"
          }
          style={{
            background: "#93c5fd",
            color: "#0b1020",
            border: "none",
            padding: "0.75rem 1.5rem",
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Pay ₹{amountRupees} with Razorpay
        </button>
      </div>

      <div
        style={{
          marginTop: "1.25rem",
          minHeight: 24,
          fontSize: 14,
          opacity: 0.85,
        }}
      >
        <StatusLine status={status} />
      </div>
    </div>
  );
}

function StatusLine({ status }: { status: Status }) {
  switch (status.kind) {
    case "idle":
      return <span>Ready. Click Pay to start.</span>;
    case "loading-script":
      return <span>Loading Razorpay Checkout.js…</span>;
    case "creating-order":
      return <span>Creating order on the server…</span>;
    case "opening-modal":
      return (
        <span>
          Opened modal for order <code>{status.orderId}</code>
        </span>
      );
    case "verifying":
      return (
        <span>
          Verifying payment <code>{status.paymentId}</code> on the server…
        </span>
      );
    case "verified":
      return (
        <span style={{ color: "#86efac" }}>
          ✓ Verified payment <code>{status.paymentId}</code> on order{" "}
          <code>{status.orderId}</code>. Webhook will flip the (demo) DB state
          asynchronously.
        </span>
      );
    case "cancelled":
      return <span>Modal dismissed — no payment made.</span>;
    case "error":
      return <span style={{ color: "#fca5a5" }}>Error: {status.message}</span>;
  }
}
