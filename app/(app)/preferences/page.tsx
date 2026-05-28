import { Pencil } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import type { Database } from "@/lib/db/database.types";
import {
  BUDGET_OPTIONS,
  DIET_TYPE_OPTIONS,
  MEAL_SLOT_OPTIONS,
  optionLabel,
  SPICE_LEVEL_OPTIONS,
  type StepId,
} from "@/lib/onboarding";
import {
  getHousehold,
  getHouseholdDishPreferences,
  getMyLikedDishes,
  resolveCurrentHousehold,
} from "@/lib/services/household";
import { cn } from "@/lib/utils";

export const metadata = { title: "Preferences" };

/** Display labels for the `meal_frequency` tiers (mirrors the build picker). */
const FREQUENCY_LABELS: Record<
  Database["public"]["Enums"]["meal_frequency"],
  string
> = {
  daily: "Daily",
  once_a_week: "Once a week",
  once_in_a_while: "Once in a while",
};

// Resolves the session + household per request; never cached.
export const dynamic = "force-dynamic";

/**
 * Preferences summary screen. A read-only roll-up of the household's taste
 * profile — diet, cuisines, schedule, preferred dishes, budget — so members can
 * cross-check the planner's suggestions against what they actually asked for. Each
 * section carries a pencil that deep-links into the edit wizard at that step
 * (gated on `can_edit_household_preferences`). Separate from `/household`, which
 * owns people and roles.
 */
export default async function PreferencesPage() {
  const current = await resolveCurrentHousehold();
  if (!current) redirect("/onboarding");

  const [household, likedDishes, dishPreferences] = await Promise.all([
    getHousehold(current.householdId),
    getMyLikedDishes(current.householdId),
    getHouseholdDishPreferences(current.householdId),
  ]);
  const prefs = household.preferences;
  const canEdit = current.currentUserPermissions.canEditHouseholdPreferences;

  // Per-dish prefs (what Step-3 combinations/build picks expanded into) read best
  // as one row per dish with its cadence; fall back to legacy liked-dish names,
  // then the "system chooses" baseline.
  const dishRows: Row[] =
    dishPreferences.length > 0
      ? dishPreferences.map((dish) => [
          dish.dishName,
          FREQUENCY_LABELS[dish.frequency],
        ])
      : [
          [
            "Favourites",
            likedDishes.length > 0 ? joinList(likedDishes) : "System chooses",
          ],
        ];

  /** Deep-link to the edit wizard at `step`, or `null` when the caller can't edit. */
  const editHref = (step: StepId): string | null =>
    canEdit ? `/onboarding?step=${step}` : null;

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 lg:px-8">
      <header>
        <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">
          {current.name}
        </p>
        <h1 className="mt-2 font-heading text-4xl font-bold tracking-tight text-balance">
          Your preferences
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          How the planner shapes your suggestions. Open any section to update
          it.
        </p>
      </header>

      {!prefs ? (
        <div className="rounded-lg border border-dashed bg-card p-10 text-center shadow-xs">
          <p className="text-sm text-muted-foreground">
            Finish setting up your household to see your preferences here.
          </p>
          <Link
            href="/onboarding"
            className={buttonVariants({ className: "mt-4" })}
          >
            Finish setup
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <PrefSection
            title="Household"
            editHref={editHref("household_basics")}
            rows={[
              ["Name", household.name],
              ["Family size", prefs.familySize],
              ["Adults", prefs.adultsCount],
              ["Kids", prefs.kidsCount],
            ]}
          />

          <PrefSection
            title="Food"
            editHref={editHref("food_preferences")}
            rows={[
              ["Diet type", optionLabel(DIET_TYPE_OPTIONS, prefs.dietType)],
              ["Cuisines", joinList(prefs.preferredCuisines)],
              [
                "Spice level",
                optionLabel(SPICE_LEVEL_OPTIONS, prefs.spiceLevel),
              ],
            ]}
          />

          <PrefSection
            title="Preferred dishes"
            editHref={editHref("preferred_dishes")}
            rows={dishRows}
          />

          <PrefSection
            title="Schedule"
            editHref={editHref("meal_schedule")}
            rows={[
              [
                "Meals to plan",
                joinList(
                  prefs.mealsToPlan.map((slot) =>
                    optionLabel(MEAL_SLOT_OPTIONS, slot),
                  ),
                ),
              ],
              [
                "Weekday cooking time",
                minutes(prefs.weekdayCookingTimeMinutes),
              ],
              [
                "Weekend cooking time",
                minutes(prefs.weekendCookingTimeMinutes),
              ],
              ["Variety gap", days(prefs.varietyGapDays)],
              ["Allow leftovers", yesNo(prefs.allowLeftovers)],
            ]}
          />

          <PrefSection
            title="Budget"
            editHref={editHref("budget")}
            rows={[
              [
                "Budget preference",
                optionLabel(BUDGET_OPTIONS, prefs.budgetPreference),
              ],
            ]}
          />
        </div>
      )}
    </section>
  );
}

type Row = [label: string, value: string | number | undefined];

/** One titled preferences card with an optional pencil edit deep-link. */
function PrefSection({
  title,
  editHref,
  rows,
}: {
  title: string;
  editHref: string | null;
  rows: Row[];
}) {
  return (
    <section className="rounded-lg border bg-card p-4 text-card-foreground shadow-xs">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-heading text-sm font-semibold tracking-tight">
          {title}
        </h2>
        {editHref ? (
          <Link
            href={editHref}
            aria-label={`Edit ${title.toLowerCase()}`}
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon" }),
              "size-8",
            )}
          >
            <Pencil className="size-4" />
          </Link>
        ) : null}
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 text-sm">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium">
              {value === undefined || value === "" ? (
                <span className="font-normal text-muted-foreground">
                  Not set
                </span>
              ) : (
                value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function joinList(values: readonly string[] | undefined): string | undefined {
  return values && values.length > 0 ? values.join(", ") : undefined;
}

function minutes(value: number | null | undefined): string | undefined {
  return value === null || value === undefined ? undefined : `${value} min`;
}

function days(value: number | undefined): string | undefined {
  return value === undefined ? undefined : `${value} days`;
}

function yesNo(value: boolean | undefined): string | undefined {
  return value === undefined ? undefined : value ? "Yes" : "No";
}
