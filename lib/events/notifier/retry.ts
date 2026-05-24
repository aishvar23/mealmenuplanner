/**
 * Bounded exponential-backoff retry for best-effort transport sends (design/09
 * § 9 — "invite emails are retried with bounded exponential backoff"). Pure: the
 * clock (`sleep`) is injected so the backoff schedule is unit-testable without
 * real timers.
 */

export interface RetryOptions {
  /** Retries AFTER the first attempt (so total attempts = retries + 1). */
  retries?: number;
  /** Base delay; attempt N waits `baseDelayMs * 2**N` before retrying. */
  baseDelayMs?: number;
  /** Injectable sleep (defaults to a real timer). */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn`, retrying on a thrown error with exponential backoff. Rethrows the
 * last error once the retries are exhausted (the caller decides whether to
 * swallow it — external sends are best-effort).
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw lastError;
}
