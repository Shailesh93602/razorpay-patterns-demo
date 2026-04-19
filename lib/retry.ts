/**
 * Exponential-backoff retry with jitter.
 *
 * Design rules (copied 1:1 from stripe-payments-demo because the
 * reasoning transfers: don't retry on 4xx — the server already told us
 * "this is wrong in a way retrying won't fix"; DO retry on 5xx and
 * network errors because those are transient).
 *
 * Jitter = random 0–25% of the computed delay. Prevents thundering
 * herd when multiple failed calls would otherwise retry at the same
 * deterministic offset.
 */

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

export const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, "shouldRetry">> = {
  maxAttempts: 4,
  baseDelayMs: 200,
  maxDelayMs: 4000,
  jitterRatio: 0.25,
};

export function defaultShouldRetry(error: unknown): boolean {
  if (!error || typeof error !== "object") return true; // assume transient
  const status = (error as { statusCode?: number; status?: number }).statusCode
    ?? (error as { statusCode?: number; status?: number }).status;

  // No statusCode → network / connection error → retry.
  if (status === undefined) return true;

  // 4xx → client error → don't retry. Razorpay returns 400 for
  // invalid signatures, bad request shapes, declined cards, etc.
  // Retrying would just burn capacity and repeatedly trigger the
  // same exact error.
  if (status >= 400 && status < 500) return false;

  // 5xx → server error / rate-limited → retry.
  return status >= 500;
}

function computeDelay(attempt: number, opts: Required<Omit<RetryOptions, "shouldRetry">>): number {
  const exp = opts.baseDelayMs * Math.pow(2, attempt);
  const capped = Math.min(exp, opts.maxDelayMs);
  const jitter = capped * opts.jitterRatio * Math.random();
  return Math.floor(capped + jitter);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const shouldRetry = options.shouldRetry ?? defaultShouldRetry;

  let lastError: unknown;
  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === opts.maxAttempts - 1) break;
      if (!shouldRetry(error, attempt)) break;
      const delay = computeDelay(attempt, opts);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}
