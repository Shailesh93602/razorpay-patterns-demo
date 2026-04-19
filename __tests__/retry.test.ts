import { withRetry, defaultShouldRetry } from "@/lib/retry";

describe("defaultShouldRetry", () => {
  it("retries on network errors (no statusCode)", () => {
    expect(defaultShouldRetry(new Error("ECONNRESET"))).toBe(true);
  });

  it("does not retry on 4xx", () => {
    expect(defaultShouldRetry({ statusCode: 400 })).toBe(false);
    expect(defaultShouldRetry({ statusCode: 401 })).toBe(false);
    expect(defaultShouldRetry({ statusCode: 404 })).toBe(false);
    expect(defaultShouldRetry({ statusCode: 499 })).toBe(false);
  });

  it("retries on 5xx", () => {
    expect(defaultShouldRetry({ statusCode: 500 })).toBe(true);
    expect(defaultShouldRetry({ statusCode: 502 })).toBe(true);
    expect(defaultShouldRetry({ statusCode: 503 })).toBe(true);
  });

  it("supports `status` as an alternative to `statusCode`", () => {
    expect(defaultShouldRetry({ status: 400 })).toBe(false);
    expect(defaultShouldRetry({ status: 503 })).toBe(true);
  });

  it("retries on unknown error shapes (fails open)", () => {
    expect(defaultShouldRetry("something weird")).toBe(true);
    expect(defaultShouldRetry(undefined)).toBe(true);
  });
});

describe("withRetry", () => {
  it("returns the first successful result", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls += 1;
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries 5xx errors up to maxAttempts", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) {
          const err: Error & { statusCode?: number } = new Error("boom");
          err.statusCode = 503;
          throw err;
        }
        return "ok";
      },
      { maxAttempts: 4, baseDelayMs: 1, maxDelayMs: 5 }
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("does not retry 4xx — fails fast", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          const err: Error & { statusCode?: number } = new Error("bad request");
          err.statusCode = 400;
          throw err;
        },
        { maxAttempts: 4, baseDelayMs: 1 }
      )
    ).rejects.toThrow("bad request");
    expect(calls).toBe(1);
  });

  it("gives up after maxAttempts and throws the last error", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          const err: Error & { statusCode?: number } = new Error(`try ${calls}`);
          err.statusCode = 503;
          throw err;
        },
        { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 5 }
      )
    ).rejects.toThrow("try 3");
    expect(calls).toBe(3);
  });

  it("honors a custom shouldRetry predicate", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new Error("nope");
        },
        {
          maxAttempts: 4,
          baseDelayMs: 1,
          shouldRetry: () => false,
        }
      )
    ).rejects.toThrow("nope");
    expect(calls).toBe(1);
  });
});
