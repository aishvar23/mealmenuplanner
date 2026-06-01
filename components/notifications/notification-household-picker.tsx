"use client";

import { usePathname, useRouter } from "next/navigation";

/**
 * Household selector for the per-household notification views (BETA). A
 * multi-household user (e.g. a tiffin supplier) picks which household's inbox or
 * email settings to manage; choosing one navigates to `?householdId=<id>` so the
 * server page re-renders scoped to it. The list view also offers "All households"
 * (value `all` → no param); settings is always a specific household.
 */
export function NotificationHouseholdPicker({
  households,
  selected,
  includeAll,
}: {
  households: readonly { householdId: string; name: string }[];
  selected: string;
  includeAll: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="font-medium text-muted-foreground">Household</span>
      <select
        value={selected}
        onChange={(event) => {
          const value = event.target.value;
          router.push(
            value === "all" ? pathname : `${pathname}?householdId=${value}`,
          );
        }}
        className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25"
      >
        {includeAll ? <option value="all">All households</option> : null}
        {households.map((household) => (
          <option key={household.householdId} value={household.householdId}>
            {household.name}
          </option>
        ))}
      </select>
    </label>
  );
}
