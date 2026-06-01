/**
 * Edit-mode onboarding — re-entering the wizard to edit an existing household's
 * preferences (instead of creating a household).
 *
 * The same wizard backs two flows: first-run **create** (autosave a draft, then
 * `POST /api/onboarding/complete`) and **edit** (seed from the live preferences,
 * then `PATCH /api/households/{id}/preferences`). These pure mappers are the
 * translation either direction — no React, no I/O — so the server page can seed
 * the wizard and the client can build the PATCH body from one tested place.
 *
 * Scope: edit mode covers exactly the `household_preferences` fields the PATCH
 * endpoint accepts (design/04 § 4.1). The household `name`/location and the
 * member-level `user_food_preferences` (allergies/health) have no update
 * endpoint, so the wizard shows the name read-only and omits the allergies step
 * (see {@link EDIT_STEP_IDS}).
 */

import type { Database } from "@/lib/db/database.types";
// Type-only — erased at compile time, so this stays runtime-agnostic and the
// `dto` module's pure mappers are never pulled in.
import type { PreferencesDto } from "@/lib/services/household/dto";

import type { DraftData, SelfBuiltDish } from "./draft";
import type { StepId } from "./steps";

type MealSlot = Database["public"]["Enums"]["meal_slot"];

/**
 * The wizard steps shown when editing an existing household (vs. the full create
 * flow). The `preferred_dishes` step is included — it round-trips the owner's
 * `liked_dishes` through the member-scoped food-preferences PATCH (BUG-006). The
 * personal allergies/health step stays omitted: it writes the *rest* of
 * `user_food_preferences` (allergies/health), which no edit endpoint covers yet.
 * Review closes the flow.
 */
export const EDIT_STEP_IDS = [
  "household_basics",
  "food_preferences",
  "preferred_dishes",
  "meal_schedule",
  "budget",
  "review",
] as const satisfies readonly StepId[];

/**
 * The editable subset of a preferences PATCH body (camelCase, design/04 § 4.1).
 * Every field is optional — the PATCH accepts any subset — but edit mode seeds
 * from the live row, so a save normally carries them all.
 */
export interface PreferencesPatch {
  familySize?: number;
  adultsCount?: number;
  kidsCount?: number;
  dietTypes?: string[];
  preferredCuisines?: string[];
  spiceLevel?: string;
  weekdayCookingTimeMinutes?: number | null;
  weekendCookingTimeMinutes?: number | null;
  mealsToPlan?: string[];
  varietyGapDays?: number;
  allowLeftovers?: boolean;
  budgetPreference?: string;
}

/**
 * Seed the wizard's {@link DraftData} from a household's live preferences so the
 * edit form opens pre-filled. `name` is included for display only (it is shown
 * read-only — there is no household-name update endpoint); location is omitted
 * for the same reason. The `null` cooking-time columns become `undefined` to
 * match the optional draft shape.
 *
 * The preferred-dishes step is seeded so it is editable post-onboarding:
 *   • `dishPreferences` (the household's `household_dish_preferences`, the dishes
 *     a combination / build pick expanded into) → `build` mode, pre-populated with
 *     each dish's frequency + suitable slots + accompaniments, so the household can
 *     retune or remove them. This is the primary source.
 *   • else `likedDishes` (legacy `user_food_preferences.liked_dishes`) → `manual`
 *     mode with them pre-selected (BUG-006).
 *   • else `system` mode (let the planner choose).
 */
export function preferencesToDraftData(
  name: string,
  prefs: PreferencesDto,
  likedDishes: string[] = [],
  dishPreferences: SelfBuiltDish[] = [],
): DraftData {
  return {
    householdBasics: {
      name,
      familySize: prefs.familySize,
      adultsCount: prefs.adultsCount,
      kidsCount: prefs.kidsCount,
    },
    foodPreferences: {
      dietTypes: prefs.dietTypes,
      preferredCuisines: prefs.preferredCuisines,
      spiceLevel: prefs.spiceLevel,
    },
    preferredDishes:
      dishPreferences.length > 0
        ? { mode: "build", builtDishes: dishPreferences }
        : likedDishes.length > 0
          ? { mode: "manual", dishNames: likedDishes }
          : { mode: "system", dishNames: [] },
    mealSchedule: {
      mealsToPlan: prefs.mealsToPlan as MealSlot[],
      weekdayCookingTimeMinutes: prefs.weekdayCookingTimeMinutes ?? undefined,
      weekendCookingTimeMinutes: prefs.weekendCookingTimeMinutes ?? undefined,
      varietyGapDays: prefs.varietyGapDays,
      allowLeftovers: prefs.allowLeftovers,
    },
    budget: {
      budgetPreference: prefs.budgetPreference,
    },
  };
}

/**
 * Build the `PATCH /api/households/{id}/preferences` body from the wizard's
 * {@link DraftData}. Only `household_preferences` fields are included — the
 * household `name`/location and allergies/health are out of scope for the PATCH
 * (see the module note). A field present in the draft is sent; an absent one is
 * omitted so the partial update only touches what was loaded/changed.
 */
export function draftDataToPreferencesPatch(data: DraftData): PreferencesPatch {
  const basics = data.householdBasics ?? {};
  const food = data.foodPreferences ?? {};
  const schedule = data.mealSchedule ?? {};
  const budget = data.budget ?? {};

  const patch: PreferencesPatch = {};

  if (basics.familySize !== undefined) patch.familySize = basics.familySize;
  if (basics.adultsCount !== undefined) patch.adultsCount = basics.adultsCount;
  if (basics.kidsCount !== undefined) patch.kidsCount = basics.kidsCount;

  if (food.dietTypes !== undefined) patch.dietTypes = food.dietTypes;
  if (food.preferredCuisines !== undefined) {
    patch.preferredCuisines = food.preferredCuisines;
  }
  if (food.spiceLevel !== undefined) patch.spiceLevel = food.spiceLevel;

  if (schedule.mealsToPlan !== undefined) {
    patch.mealsToPlan = schedule.mealsToPlan;
  }
  if (schedule.weekdayCookingTimeMinutes !== undefined) {
    patch.weekdayCookingTimeMinutes = schedule.weekdayCookingTimeMinutes;
  }
  if (schedule.weekendCookingTimeMinutes !== undefined) {
    patch.weekendCookingTimeMinutes = schedule.weekendCookingTimeMinutes;
  }
  if (schedule.varietyGapDays !== undefined) {
    patch.varietyGapDays = schedule.varietyGapDays;
  }
  if (schedule.allowLeftovers !== undefined) {
    patch.allowLeftovers = schedule.allowLeftovers;
  }

  if (budget.budgetPreference !== undefined) {
    patch.budgetPreference = budget.budgetPreference;
  }

  return patch;
}

/**
 * The preferred-dish picks to send to `PATCH .../food-preferences` (BUG-006 +
 * P10 + BUG-026). Mirrors the completion mapping (`validate-completion.ts`):
 *   • `system` → no favourites (`[]`), explicitly delegating to the engine.
 *   • otherwise → the additive union of the built mains **and** the hand-picked
 *     dish names (the two `liked_dishes` sources merge regardless of the active
 *     picker). Selected combinations aren't edited here (no edit endpoint yet —
 *     a follow-up), so they contribute nothing.
 * Names are trimmed and de-duplicated. The food-preferences PATCH is a separate
 * call from {@link draftDataToPreferencesPatch} because liked dishes live in the
 * member's `user_food_preferences`, not the household's `household_preferences`.
 */
export function draftDataToLikedDishes(data: DraftData): string[] {
  const preferred = data.preferredDishes ?? {};
  if (preferred.mode === "system") {
    return [];
  }

  const names = [
    ...(preferred.builtDishes ?? []).map((dish) => dish.dishName),
    ...(preferred.dishNames ?? []),
  ];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    if (typeof name !== "string") continue;
    const trimmed = name.trim();
    if (trimmed.length > 0 && !seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}
