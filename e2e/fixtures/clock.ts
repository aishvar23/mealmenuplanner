/**
 * Deterministic cutoff helpers for provider E2E/integration specs.
 *
 * Per `07_test_strategy.md` §4, provider cutoff behavior is exercised by seeding a
 * menu day's `cutoff_at` relative to server time and driving the lock RPC
 * directly, rather than waiting on the 5-minute cron. These helpers produce the
 * relative ISO timestamps a spec hands to the (future) provider fixtures.
 *
 * The TypeScript domain layer gets its own injectable clock at
 * `lib/time/clock.ts`; this module is the E2E-side seeding counterpart and is
 * intentionally decoupled from app modules so Playwright's transpiler need not
 * resolve the `@/` alias.
 */

const MINUTE_MS = 60_000;

/** An ISO timestamp `ms` from now (positive = future, negative = past). */
export function isoFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

/** A cutoff comfortably in the future — used to seed an OPEN menu day. */
export function cutoffOpen(minutesAhead = 30): string {
  return isoFromNow(minutesAhead * MINUTE_MS);
}

/** A cutoff already in the past — used to seed a LOCKED menu day. */
export function cutoffPassed(minutesAgo = 1): string {
  return isoFromNow(-minutesAgo * MINUTE_MS);
}

/**
 * A cutoff just barely in the future — for "still open, about to close" cases
 * where a spec confirms a response and then drives the lock RPC manually.
 */
export function cutoffImminent(secondsAhead = 120): string {
  return isoFromNow(secondsAhead * 1_000);
}
