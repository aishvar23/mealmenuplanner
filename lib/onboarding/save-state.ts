/**
 * Autosave save-state model — the status machine and the exact UI strings the
 * onboarding wizard shows for its draft autosave (design/06 § 5). Pure and
 * runtime-agnostic (no React, no fetch), so the relative-time formatting is
 * unit-testable and the hook (P2-3) just renders the result.
 *
 * The strings are fixed by the spec (docs/07): `Saving...`, `Saved just now`,
 * `Last saved N minutes ago` (relative, recomputed from `lastSavedAt`), and
 * `Save failed. Retry.`.
 */

/** Where the autosave currently is. */
export type SaveStatus = "idle" | "saving" | "saved" | "error";

/** Shown while a save request is in flight. */
export const SAVING_LABEL = "Saving...";

/** Shown when the last save failed; the text doubles as the retry control. */
export const SAVE_FAILED_LABEL = "Save failed. Retry.";

/** Shown right after a successful save (< 1 minute old). */
export const SAVED_JUST_NOW_LABEL = "Saved just now";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/**
 * The relative "last saved …" string from a successful save's `lastSavedAt`
 * (design/06 § 5), or `null` when there is nothing saved yet (so the indicator
 * renders nothing). `< 1 min` reads "Saved just now"; older reads "Last saved N
 * minutes/hours/days ago". `nowMs` is injectable for deterministic tests.
 */
export function formatRelativeLastSaved(
  lastSavedAt: string | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  if (!lastSavedAt) return null;
  const savedMs = Date.parse(lastSavedAt);
  if (Number.isNaN(savedMs)) return null;

  const seconds = Math.max(0, Math.floor((nowMs - savedMs) / 1000));
  if (seconds < MINUTE) return SAVED_JUST_NOW_LABEL;
  if (seconds < HOUR)
    return `Last saved ${plural(Math.floor(seconds / MINUTE), "minute")} ago`;
  if (seconds < DAY)
    return `Last saved ${plural(Math.floor(seconds / HOUR), "hour")} ago`;
  return `Last saved ${plural(Math.floor(seconds / DAY), "day")} ago`;
}
