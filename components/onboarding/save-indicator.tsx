"use client";

import { Check, CircleAlert, Loader2 } from "lucide-react";

import {
  formatRelativeLastSaved,
  SAVE_FAILED_LABEL,
  SAVING_LABEL,
  type SaveStatus,
} from "@/lib/onboarding";
import { cn } from "@/lib/utils";

/**
 * Autosave save-state indicator (P2-3) — the small status near the wizard header
 * that reflects the {@link SaveStatus}, using the exact spec strings (design/06
 * § 5). On failure the label is an actionable retry control.
 *
 * The relative "Last saved …" string is recomputed from `lastSavedAt` on each
 * render; the wizard ticks a timer so it stays current between saves.
 */
export function SaveIndicator({
  status,
  lastSavedAt,
  onRetry,
}: {
  status: SaveStatus;
  lastSavedAt: string | null;
  onRetry: () => void;
}) {
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        {SAVING_LABEL}
      </span>
    );
  }

  if (status === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-sm text-xs font-medium text-destructive",
          "outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50",
        )}
      >
        <CircleAlert className="size-3.5" aria-hidden />
        {SAVE_FAILED_LABEL}
      </button>
    );
  }

  const relative = formatRelativeLastSaved(lastSavedAt);
  if (!relative) return null;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Check className="size-3.5 text-primary" aria-hidden />
      {relative}
    </span>
  );
}
