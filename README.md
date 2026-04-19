# razorpay-patterns-demo

Runnable reference demo of Razorpay webhook idempotency + retry patterns — the India-accessible mirror of [stripe-payments-demo](https://github.com/Shailesh93602/stripe-payments-demo).

`git clone && npm install && npm test` → 25+ tests pass in ~2 seconds. No Razorpay account required to run the test suite or the local fixture replay.

## Endpoints

- `POST /api/webhook` — Razorpay webhook receiver. Verifies `X-Razorpay-Signature` (HMAC-SHA256 of raw body with webhook secret). SETNX idempotency guard on the payment/order/subscription entity ID. 24h TTL matches Razorpay's retry window.
- `POST /api/order` — create a Razorpay Order with a caller-supplied `receipt` (idempotency key). Exp-backoff retry on 5xx; skips 4xx.
- `GET /api/health` — Redis PING.

## Running locally

```bash
cp .env.example .env
# Fill in RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, REDIS_URL

npm install
npm run dev            # http://localhost:3000
npm test               # ~25 unit tests
npm run replay         # fires a signed fake webhook at http://localhost:3000/api/webhook
```

## The 3 patterns this demo teaches

1. **Webhook idempotency via SETNX**
   - Key: `razorpay:event:{entityId}`, 24h TTL — covers Razorpay's full retry window.
   - Atomic: `SET key '1' EX 86400 NX`. First delivery returns `OK` → run handler. Duplicate returns `nil` → skip.
   - Handler side effects happen exactly once even when transport is at-least-once.

2. **Webhook signature verification**
   - Raw body required — `await request.text()`, NOT `request.json()`. JSON parse + re-stringify reorders keys and breaks HMAC.
   - `crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex")` → compare constant-time with `X-Razorpay-Signature`.

3. **Exp-backoff retry that bypasses 4xx**
   - `delay = baseDelayMs * 2^attempt + 0-25% jitter`
   - Retry on 5xx + network errors; skip 4xx because Razorpay will return the same error every time.
   - Jitter prevents thundering herd when multiple failed calls would otherwise retry at the same deterministic offset.

## Deploying to Vercel

1. Push to GitHub.
2. Vercel → Add New → Project → import this repo → Next.js auto-detected.
3. Add env vars (Production):
   - `RAZORPAY_KEY_ID` — `rzp_test_...` from Razorpay Dashboard → Settings → API Keys
   - `RAZORPAY_KEY_SECRET` — one-time display when you generate the key pair
   - `REDIS_URL` — Vercel Upstash integration at <https://vercel.com/integrations/upstash>
   - `RAZORPAY_WEBHOOK_SECRET` — set after first deploy (see step 5)
4. Deploy; note the URL.
5. Razorpay Dashboard → Settings → Webhooks → Add New Webhook:
   - URL: `https://<your-vercel-url>/api/webhook`
   - Secret: click "Generate" — Razorpay creates a random string. Copy it. Set on Vercel as `RAZORPAY_WEBHOOK_SECRET` → redeploy.
   - Active events: `payment.captured`, `payment.failed`, `order.paid`, `refund.processed` (add more as needed).
6. Send a test event from Razorpay Dashboard → Webhooks → your endpoint → "Send test". Check Vercel function logs for `ok: true, duplicate: false, eventId: payment:pay_xxx`. Click "Send test" again — second call should log `duplicate: true`.

## Relation to stripe-payments-demo

Same idempotency + retry architecture. Only the signing scheme differs:

| Aspect | Stripe | Razorpay |
|---|---|---|
| Signature header | `Stripe-Signature: t=timestamp,v1=sig` | `X-Razorpay-Signature: <hex>` |
| HMAC input | `{timestamp}.{rawBody}` | `{rawBody}` |
| Signature lib | `stripe.webhooks.constructEvent` | hand-roll `crypto.createHmac` |
| Event ID | `event.id` (top-level) | derived from `payload.payment.entity.id` etc. |
| Retry window | 7 days | 24 hours |
| TTL for SETNX | 86400 (24h buffer in 7d window) | 86400 (matches retry window exactly) |

## License

MIT. This is a portable pattern reference — copy, fork, adapt.
