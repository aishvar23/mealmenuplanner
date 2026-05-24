"use client";

import { useState } from "react";

import { DishStatusBadge } from "@/components/admin/dish-status-badge";
import { Button } from "@/components/ui/button";
import type { DishDetailDto } from "@/lib/services/admin/dto";
import type { QualityChecklist } from "@/lib/services/admin/quality-checklist";
import { cn } from "@/lib/utils";

import { AdminApiError, setDishStatus } from "./admin-api";

/**
 * Quality-checklist + activation panel (docs/06, P3-8). Shows each checklist
 * item (required vs. advisory) and offers Activate / Archive / Back-to-draft.
 * Activation is disabled until every required item is satisfied — and the server
 * re-checks, so a stale client can't force an incomplete dish active.
 */
export function QualityChecklistPanel({
  dishId,
  status,
  checklist,
  onChanged,
}: {
  dishId: string;
  status: DishDetailDto["status"];
  checklist: QualityChecklist;
  onChanged: (detail: DishDetailDto) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function transition(next: string) {
    setBusy(true);
    setError(null);
    try {
      onChanged(await setDishStatus(dishId, next));
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Failed to update the status.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold">Activation</h2>
        <DishStatusBadge status={status} />
      </div>

      <ul className="grid gap-1.5 text-sm">
        {checklist.items.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn(
                "inline-flex size-4 items-center justify-center rounded-full text-[10px] font-bold",
                item.satisfied
                  ? "bg-primary/15 text-primary"
                  : item.required
                    ? "bg-destructive/15 text-destructive"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {item.satisfied ? "✓" : "•"}
            </span>
            <span className={cn(!item.satisfied && "text-muted-foreground")}>
              {item.label}
            </span>
            {!item.required ? (
              <span className="text-xs text-muted-foreground">(optional)</span>
            ) : null}
          </li>
        ))}
      </ul>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {status !== "active" ? (
          <Button
            type="button"
            size="lg"
            disabled={busy || !checklist.canActivate}
            onClick={() => transition("active")}
          >
            Activate
          </Button>
        ) : null}
        {status !== "archived" ? (
          <Button
            type="button"
            size="lg"
            variant="destructive"
            disabled={busy}
            onClick={() => transition("archived")}
          >
            Archive
          </Button>
        ) : null}
        {status !== "draft" ? (
          <Button
            type="button"
            size="lg"
            variant="outline"
            disabled={busy}
            onClick={() => transition("draft")}
          >
            Back to draft
          </Button>
        ) : null}
      </div>

      {!checklist.canActivate && status !== "active" ? (
        <p className="text-xs text-muted-foreground">
          Complete the required items above before this dish can be activated.
        </p>
      ) : null}
    </div>
  );
}
