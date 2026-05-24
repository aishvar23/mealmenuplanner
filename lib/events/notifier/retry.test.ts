import { describe, expect, it, vi } from "vitest";

import { retryWithBackoff } from "./retry";

describe("retryWithBackoff", () => {
  it("returns the first successful result without sleeping", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockResolvedValue("ok");

    await expect(retryWithBackoff(fn, { sleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries on failure with exponential backoff, then succeeds", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("1"))
      .mockRejectedValueOnce(new Error("2"))
      .mockResolvedValue("ok");

    await expect(
      retryWithBackoff(fn, { retries: 3, baseDelayMs: 100, sleep }),
    ).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([100, 200]);
  });

  it("rethrows the last error once retries are exhausted", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockRejectedValue(new Error("always"));

    await expect(
      retryWithBackoff(fn, { retries: 2, baseDelayMs: 10, sleep }),
    ).rejects.toThrow("always");
    expect(fn).toHaveBeenCalledTimes(3); // 1 + 2 retries
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
