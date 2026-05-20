import { describe, expect, it, vi } from "vitest";

import { isTransientNetworkError, withRetry } from "../src/retry.js";

describe("retry helpers", () => {
  it("retries transient fetch failures and returns the eventual result", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce("ok");
    const onRetry = vi.fn();

    await expect(
      withRetry(operation, {
        attempts: 3,
        initialDelayMs: 0,
        onRetry
      })
    ).resolves.toBe("ok");

    expect(operation).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("does not retry non-transient failures", async () => {
    const operation = vi.fn<() => Promise<string>>().mockRejectedValue(new Error("configuration missing"));

    await expect(withRetry(operation, { attempts: 3, initialDelayMs: 0 })).rejects.toThrow("configuration missing");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("treats rate limits, server errors, and network causes as transient", () => {
    expect(isTransientNetworkError({ status: 429 })).toBe(true);
    expect(isTransientNetworkError({ status: 503 })).toBe(true);
    expect(isTransientNetworkError(new TypeError("fetch failed"))).toBe(true);
    expect(isTransientNetworkError(new Error("Erreur COROS HTTP 500 sur analyse/query."))).toBe(true);
    expect(isTransientNetworkError({ message: "fetch failed", cause: { code: "UND_ERR_CONNECT_TIMEOUT" } })).toBe(true);
    expect(isTransientNetworkError(new Error("Token invalide"))).toBe(false);
  });
});
