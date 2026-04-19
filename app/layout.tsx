import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "razorpay-patterns-demo",
  description:
    "Runnable reference demo of Razorpay webhook idempotency + retry patterns.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          margin: 0,
          background: "#0b1020",
          color: "#e5e7eb",
        }}
      >
        {children}
      </body>
    </html>
  );
}
