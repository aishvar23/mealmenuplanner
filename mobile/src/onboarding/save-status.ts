import type { SaveState } from "./use-onboarding";

/**
 * The autosave status line strings (design/06 § 5). Mirrors the web wizard's
 * indicator: `Saving...`, `Saved just now`, `Last saved N minutes ago` (relative,
 * recomputed from `lastSavedAt`), and `Save failed. Retry.`. The relative time is
 * derived client-side from the last successful save's timestamp.
 */

export interface SaveStatusLabel {
  text: string;
  /** True when the line is the actionable retry control. */
  isError: boolean;
}

export function formatSaveStatus(
  save: SaveState,
  now: number = Date.now(),
): SaveStatusLabel | null {
  if (save.status === "saving") return { text: "Saving...", isError: false };
  if (save.status === "error") {
    return { text: "Save failed. Retry.", isError: true };
  }
  if (save.status === "saved" && save.lastSavedAt) {
    return { text: relativeSaved(save.lastSavedAt, now), isError: false };
  }
  return null;
}

function relativeSaved(lastSavedAt: string, now: number): string {
  const elapsedMs = now - new Date(lastSavedAt).getTime();
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return "Saved just now";
  if (minutes === 1) return "Last saved 1 minute ago";
  if (minutes < 60) return `Last saved ${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "Last saved 1 hour ago";
  return `Last saved ${hours} hours ago`;
}
