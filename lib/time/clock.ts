/**
 * Injectable clock — the deterministic-time seam for the Meal Provider domain.
 *
 * `07_test_strategy.md` §4 requires that pure cutoff/validators take an injected
 * `now()` rather than calling `Date.now()` directly, so cutoff behavior is
 * deterministic under test. Domain code (e.g. the cutoff validator and
 * `process_provider_cutoff`'s pure helpers in MP-A-130/141) should accept a
 * {@link Clock} and default to {@link systemClock} in production; tests pass
 * {@link fixedClock}/{@link offsetClock} to pin or shift "now" without waiting on
 * the 5-minute cron.
 *
 * DB functions still use Postgres `now()` (integration tests seed `cutoff_at`
 * relative to server time); this seam is for the TypeScript layer only.
 */
export interface Clock {
  /** The current instant. Pure code must read time only through this. */
  now(): Date;
}

/** Production clock: reads the real wall clock. The default in app code. */
export const systemClock: Clock = {
  now: () => new Date(),
};

/**
 * A clock frozen at a fixed instant. Each `now()` returns a fresh `Date` so a
 * caller mutating the result cannot poison later reads.
 */
export function fixedClock(at: Date | string | number): Clock {
  const fixed = at instanceof Date ? at.getTime() : new Date(at).getTime();
  if (Number.isNaN(fixed)) {
    throw new TypeError(`fixedClock: invalid instant ${String(at)}`);
  }
  return { now: () => new Date(fixed) };
}

/** A clock offset from `base` by `ms` (positive = future, negative = past). */
export function offsetClock(base: Clock, ms: number): Clock {
  return { now: () => new Date(base.now().getTime() + ms) };
}
