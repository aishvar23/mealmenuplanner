import type { User } from "@supabase/supabase-js";

/**
 * Pure formatting helpers that turn raw rows into the human-readable variables
 * the templates render (design/09 § 6). Kept client-safe (no `server-only`, no
 * I/O) and deterministic on an injected `now` so the relative day words are
 * reproducible in tests.
 *
 * Dates are interpreted in UTC — the same documented MVP simplification the
 * recommendation engine and `prep_reminders` job use (no per-household timezone
 * column yet).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` for a `Date`, in UTC. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * A slot label relative to today (design/09 § 6 `{{slotLabel}}`): today's dinner
 * reads "tonight's dinner"; another today slot reads "today's lunch"; tomorrow
 * reads "tomorrow's breakfast"; any other day reads "Saturday dinner".
 */
export function formatSlotLabel(
  slot: string,
  date: string,
  now: Date = new Date(),
): string {
  const today = isoDate(now);
  const tomorrow = isoDate(new Date(now.getTime() + MS_PER_DAY));

  if (date === today) {
    return slot === "dinner" ? "tonight's dinner" : `today's ${slot}`;
  }
  if (date === tomorrow) {
    return `tomorrow's ${slot}`;
  }
  const weekday = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });
  return `${weekday} ${slot}`;
}

/** A short calendar date ("May 26") from an ISO timestamp, in UTC. */
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The actor's display name for a template. Prefers the verified user's profile
 * metadata (`full_name` / `name`), then the email local-part, then a neutral
 * fallback — so a notification never renders "undefined".
 */
export function actorDisplayName(
  user: Pick<User, "email" | "user_metadata">,
): string {
  const meta = (user.user_metadata ?? {}) as {
    full_name?: string;
    name?: string;
  };
  const fromMeta = (meta.full_name ?? meta.name ?? "").trim();
  if (fromMeta) return fromMeta;
  const local = (user.email ?? "").split("@")[0]?.trim();
  return local || "Someone";
}
