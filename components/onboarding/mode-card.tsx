"use client";

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A large selectable "mode" card — the top-level choice on the preferred-dishes
 * step (P10): Select combinations / Build your own / Let the system decide.
 * Extracted from the inline card so all three modes share one presentation.
 */
export function ModeCard({
  icon: Icon,
  title,
  description,
  selected,
  onSelect,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/25",
        selected
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:border-primary/30 hover:bg-primary/5",
      )}
    >
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-lg",
          selected
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="font-heading text-base font-bold">{title}</span>
      <span className="text-sm leading-5 text-muted-foreground">
        {description}
      </span>
    </button>
  );
}
