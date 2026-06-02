/**
 * Calendar-date helpers for the daily loop. The API speaks `YYYY-MM-DD` calendar
 * days; we derive them from the **device-local** date so "today" matches what the
 * user sees on their phone, then format for display.
 */

/** Today as a local `YYYY-MM-DD` (not UTC — the user's wall-clock day). */
export function todayISO(): string {
  const now = new Date();
  return toISODate(now);
}

/** A local `Date` → `YYYY-MM-DD`. */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** `YYYY-MM-DD` shifted by `days` (can be negative), staying a calendar date. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/** The default week range for the Week tab: today through the next 6 days. */
export function defaultWeekRange(fromISO = todayISO()): {
  startDate: string;
  endDate: string;
} {
  return { startDate: fromISO, endDate: addDays(fromISO, 6) };
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** `2026-06-02` → `Tue, Jun 2`. */
export function formatDayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d ?? 1);
  return `${WEEKDAY[date.getDay()]}, ${MONTH[(m ?? 1) - 1]} ${d}`;
}

/** True when the `YYYY-MM-DD` is the device-local today. */
export function isToday(iso: string): boolean {
  return iso === todayISO();
}
