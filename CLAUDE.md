# CLAUDE.md — razorpay-patterns-demo

## Project overview

India-accessible mirror of `stripe-payments-demo`. Ships the same idempotency + retry pattern against Razorpay's webhook signing scheme. Required because Stripe is invite-only in India and the owner needs a live-testable payments demo for recruiter-facing portfolios.

See `drafts/RAZORPAY_PLAN.md` in portfolio_next for the multi-phase integration plan (this demo is Phase 1; Phases 2-3 integrate Razorpay into KhataGO + EduScale as real billing).

## Stack

Next.js 16 (App Router, nodejs runtime), TypeScript, `razorpay` SDK v2, ioredis, Jest + ts-jest + supertest, Prettier + ESLint. Deploys on Vercel.

## Key commands

```bash
npm install
npm run dev              # http://localhost:3000
npm run build
npm run start
npm test                 # ~18 unit tests (signature verify, retry, event-id extraction)
npm run type-check
npm run lint
npm run format / format:check
npm run replay           # fires a signed fake webhook twice — demonstrates idempotency locally
```

## Architecture

```
app/
  api/
    webhook/route.ts        POST — verify X-Razorpay-Signature, SETNX idempotency, dispatch
    order/route.ts          POST — razorpay.orders.create with receipt + exp-backoff retry
    health/route.ts         GET  — Redis PING
    simulate-payment/       reserved — local test helper
  layout.tsx                minimal shell (no Tailwind — reads fast as a recruiter reference)
  page.tsx                  static landing page with sequence diagram + pattern explanation

lib/
  razorpay.ts               lazy client + verifyWebhookSignature + extractEventId
  idempotency.ts            SETNX guard with 24h TTL (matches Razorpay retry window)
  retry.ts                  exp-backoff + jitter + skip-4xx
```

## The three patterns this demo teaches

1. **Webhook idempotency via SETNX** on `razorpay:event:{payment|order|subscription|refund}:{id}` with 24h TTL (Razorpay retries webhooks for 24 hours on non-2xx).
2. **Signature verification** with hand-rolled HMAC-SHA256 of the raw body — Razorpay doesn't ship a `constructEvent` helper like Stripe does. `await request.text()` is non-negotiable (JSON.parse reorders keys and breaks HMAC).
3. **Exp-backoff retry with 4xx skip** — retry 5xx + network; 4xx (declined, invalid amount, duplicate receipt) fails fast because Razorpay returns the same error every time.

## Differences from stripe-payments-demo

| Aspect | Stripe | Razorpay |
|---|---|---|
| Signature header | `Stripe-Signature: t=ts,v1=sig` | `X-Razorpay-Signature: <hex>` |
| HMAC input | `{timestamp}.{rawBody}` | `{rawBody}` only |
| Helper | `stripe.webhooks.constructEvent` | hand-rolled `crypto.createHmac` |
| Event ID | `event.id` top-level | derived from `payload.payment.entity.id` (etc.) |
| Retry window | 7 days | 24 hours |

Shared helpers (`lib/idempotency.ts`, `lib/retry.ts`) are semantically identical — copy-paste with minor tweaks.

## Env vars

| Variable | Required | Purpose |
|---|---|---|
| `RAZORPAY_KEY_ID` | Yes | `rzp_test_...` from Razorpay Dashboard → Settings → API Keys |
| `RAZORPAY_KEY_SECRET` | Yes | One-time-displayed secret that pairs with the Key ID |
| `RAZORPAY_WEBHOOK_SECRET` | Yes (runtime) | Razorpay Dashboard → Settings → Webhooks → your endpoint → Generate |
| `REDIS_URL` | Yes | Upstash on Vercel; any redis:// URL locally |

## Deployment

Vercel → Next.js preset auto-detects. No custom `functions.runtime` block in `vercel.json` — runtime is set per-route via `export const runtime = "nodejs"`.

After first deploy: create the Razorpay webhook in the dashboard pointing at `https://<deployed-url>/api/webhook`, copy the signing secret back as `RAZORPAY_WEBHOOK_SECRET` env var, redeploy once, send test webhook twice from the dashboard → second call logs `duplicate: true`.

## Related

- Parent portfolio: `/Users/shaileshchaudhary/Desktop/Coding/portfolio_next/CLAUDE.md`
- Sister repo: `/Users/shaileshchaudhary/Desktop/Coding/stripe-payments-demo/CLAUDE.md`
- Integration target (Phase 2): `/Users/shaileshchaudhary/Desktop/Coding/KhataGO/CLAUDE.md`
- Integration target (Phase 3): `/Users/shaileshchaudhary/Desktop/Coding/EduScale/CLAUDE.md`
