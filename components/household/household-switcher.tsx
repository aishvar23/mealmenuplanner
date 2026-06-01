"use client";

import { Check, Home, Star, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { UserHouseholdSummary } from "@/lib/services/household";
import { cn } from "@/lib/utils";

/** Friendly label for a membership role. */
const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

/**
 * Household switcher / manager (BETA). Lists every household the user actively
 * belongs to and lets them switch the one they're viewing (`active`) or star a
 * default (`preferred`). Both persist server-side via the `/api/households/active`
 * and `/api/households/preferred` routes; after a switch we `router.refresh()` so
 * the rest of the app (Today/Week/Grocery/Household) re-renders for the new
 * household.
 */
export function HouseholdSwitcher({
  initialHouseholds,
}: {
  initialHouseholds: UserHouseholdSummary[];
}) {
  const router = useRouter();
  const [households, setHouseholds] = useState(initialHouseholds);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // The household awaiting a delete confirmation (two-step, no native dialog).
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function mutate(
    path: "active" | "preferred",
    householdId: string,
    successMessage: string,
    refresh: boolean,
  ) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/households/${path}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ householdId }),
          cache: "no-store",
        });
        if (!res.ok) {
          const envelope = (await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(
            envelope?.error?.message ?? `Request failed (${res.status})`,
          );
        }
        const data = (await res.json()) as {
          households: UserHouseholdSummary[];
        };
        setHouseholds(data.households);
        toast.success(successMessage);
        // Switching the active household changes what every other screen shows.
        if (refresh) router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  function removeHousehold(householdId: string, name: string) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/households/${householdId}`, {
          method: "DELETE",
          cache: "no-store",
        });
        if (!res.ok) {
          const envelope = (await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(
            envelope?.error?.message ?? `Request failed (${res.status})`,
          );
        }
        const data = (await res.json()) as {
          households: UserHouseholdSummary[];
        };
        setHouseholds(data.households);
        setConfirmDeleteId(null);
        toast.success(`Deleted ${name}`);
        // Deleting the viewed household changes what the rest of the app shows.
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {households.map((household) => (
          <li
            key={household.householdId}
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs",
              household.isActive && "border-primary/40 bg-primary/5",
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Home className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-heading text-lg font-bold tracking-tight">
                  <span className="truncate">{household.name}</span>
                  {household.isActive ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-primary px-1.5 py-0.5 text-[0.65rem] font-bold text-primary-foreground">
                      <Check className="size-3" />
                      Viewing
                    </span>
                  ) : null}
                  {household.isPreferred ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-[0.65rem] font-bold text-accent-foreground">
                      <Star className="size-3" />
                      Default
                    </span>
                  ) : null}
                </p>
                <p className="text-sm text-muted-foreground">
                  {ROLE_LABELS[household.role] ?? household.role}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {household.isActive ? (
                <span className="text-sm font-semibold text-primary">
                  Currently viewing
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    mutate(
                      "active",
                      household.householdId,
                      `Switched to ${household.name}`,
                      true,
                    )
                  }
                >
                  Switch to this
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={pending || household.isPreferred}
                onClick={() =>
                  mutate(
                    "preferred",
                    household.householdId,
                    `${household.name} is now your default`,
                    false,
                  )
                }
              >
                <Star data-icon="inline-start" />
                {household.isPreferred ? "Default" : "Set as default"}
              </Button>
              {household.role === "owner" ? (
                confirmDeleteId === household.householdId ? (
                  <span className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={pending}
                      onClick={() =>
                        removeHousehold(household.householdId, household.name)
                      }
                    >
                      Confirm delete
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      Cancel
                    </Button>
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => setConfirmDeleteId(household.householdId)}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 data-icon="inline-start" />
                    Delete
                  </Button>
                )
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
