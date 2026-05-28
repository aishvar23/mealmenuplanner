"use client";

import { Button } from "@/components/ui/button";
import {
  builtDishNames,
  BUDGET_OPTIONS,
  combinationDisplayNames,
  DIET_TYPE_OPTIONS,
  HEALTH_TAG_OPTIONS,
  manualDishNames,
  MEAL_SLOT_OPTIONS,
  optionLabel,
  SPICE_LEVEL_OPTIONS,
  type DraftData,
  type StepId,
} from "@/lib/onboarding";

/**
 * Step 6 — read-only review (design/06 § 2). Summarizes everything entered so
 * far and lets the user jump back to any step to edit. Saving and finishing the
 * draft into live rows is the completion transaction wired in P2-6; here the
 * Finish action is handled by the wizard.
 *
 * In `edit` mode the personal allergies/health section is hidden — that step is
 * not part of the preferences-edit flow (it has no update endpoint).
 */
export function ReviewStep({
  data,
  onEditStep,
  mode = "create",
}: {
  data: DraftData;
  onEditStep: (step: StepId) => void;
  mode?: "create" | "edit";
}) {
  const basics = data.householdBasics ?? {};
  const food = data.foodPreferences ?? {};
  const preferred = data.preferredDishes ?? {};
  const schedule = data.mealSchedule ?? {};
  const health = data.allergiesHealth ?? {};
  const budget = data.budget ?? {};

  return (
    <div className="flex flex-col gap-4">
      <Section
        title="Household"
        step="household_basics"
        onEditStep={onEditStep}
        rows={[
          ["Name", basics.name],
          ["Family size", basics.familySize],
          ["Adults", basics.adultsCount],
          ["Kids", basics.kidsCount],
          ["Country", basics.locationCountry],
          ["City", basics.locationCity],
        ]}
      />

      <Section
        title="Food"
        step="food_preferences"
        onEditStep={onEditStep}
        rows={[
          [
            "Diet type",
            food.dietType
              ? optionLabel(DIET_TYPE_OPTIONS, food.dietType)
              : undefined,
          ],
          ["Cuisines", joinList(food.preferredCuisines)],
          [
            "Spice level",
            food.spiceLevel
              ? optionLabel(SPICE_LEVEL_OPTIONS, food.spiceLevel)
              : undefined,
          ],
        ]}
      />

      {mode === "edit" ? null : (
        <Section
          title="Preferred dishes"
          step="preferred_dishes"
          onEditStep={onEditStep}
          rows={preferredDishesRows(preferred)}
        />
      )}

      <Section
        title="Schedule"
        step="meal_schedule"
        onEditStep={onEditStep}
        rows={[
          [
            "Meals to plan",
            joinList(
              schedule.mealsToPlan?.map((slot) =>
                optionLabel(MEAL_SLOT_OPTIONS, slot),
              ),
            ),
          ],
          ["Weekday cooking time", minutes(schedule.weekdayCookingTimeMinutes)],
          ["Weekend cooking time", minutes(schedule.weekendCookingTimeMinutes)],
          ["Variety gap", days(schedule.varietyGapDays)],
          ["Allow leftovers", yesNo(schedule.allowLeftovers)],
        ]}
      />

      {mode === "edit" ? null : (
        <Section
          title="Allergies & health"
          step="allergies_health"
          onEditStep={onEditStep}
          rows={[
            ["Allergies", joinList(health.allergies)],
            ["Disliked ingredients", joinList(health.dislikedIngredients)],
            [
              "Dietary goals",
              joinList(
                health.healthPreferenceTags?.map((tag) =>
                  optionLabel(HEALTH_TAG_OPTIONS, tag),
                ),
              ),
            ],
            [
              "Spice preference",
              health.spicePreference
                ? optionLabel(SPICE_LEVEL_OPTIONS, health.spicePreference)
                : undefined,
            ],
          ]}
        />
      )}

      <Section
        title="Budget"
        step="budget"
        onEditStep={onEditStep}
        rows={[
          [
            "Budget preference",
            budget.budgetPreference
              ? optionLabel(BUDGET_OPTIONS, budget.budgetPreference)
              : undefined,
          ],
        ]}
      />
    </div>
  );
}

type Row = [label: string, value: string | number | undefined];

function Section({
  title,
  step,
  onEditStep,
  rows,
}: {
  title: string;
  step: StepId;
  onEditStep: (step: StepId) => void;
  rows: Row[];
}) {
  return (
    <section className="rounded-lg border bg-card p-4 text-card-foreground">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-heading text-sm font-semibold tracking-tight">
          {title}
        </h3>
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={() => onEditStep(step)}
        >
          Edit
        </Button>
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

/**
 * The review rows for the preferred-dishes step (P10 + BUG-024 + BUG-026). The
 * three slices are additive, so every populated source is listed by name — chosen
 * combinations (resolved via the name captured at pick time), self-built dishes,
 * and legacy hand-picked favourites — not a bare count or "Not set". With nothing
 * picked (or an explicit "system"), it shows the accurate "system chooses" state.
 */
function preferredDishesRows(
  preferred: NonNullable<DraftData["preferredDishes"]>,
): Row[] {
  if (preferred.mode === "system") {
    return [["Selection", "System chooses"]];
  }

  const combinations = combinationDisplayNames(preferred);
  const built = builtDishNames(preferred);
  const manual = manualDishNames(preferred);

  const rows: Row[] = [];
  if (combinations.length > 0) {
    rows.push(["Meal combinations", combinations.join(", ")]);
  }
  if (built.length > 0) {
    rows.push(["Built dishes", built.join(", ")]);
  }
  if (manual.length > 0) {
    rows.push(["Favourite dishes", manual.join(", ")]);
  }

  return rows.length > 0 ? rows : [["Selection", "System chooses"]];
}

function joinList(values: readonly string[] | undefined): string | undefined {
  return values && values.length > 0 ? values.join(", ") : undefined;
}

function minutes(value: number | undefined): string | undefined {
  return value === undefined ? undefined : `${value} min`;
}

function days(value: number | undefined): string | undefined {
  return value === undefined ? undefined : `${value} days`;
}

function yesNo(value: boolean | undefined): string | undefined {
  return value === undefined ? undefined : value ? "Yes" : "No";
}
