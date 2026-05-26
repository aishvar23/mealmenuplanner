/**
 * Completion validation + normalization — the strict, authoritative gate that
 * turns a partial onboarding draft into the live-row payloads `complete_onboarding`
 * writes (design/06 § 7). Pure and I/O-free (no `server-only`, no Supabase), so it
 * is trivially unit-testable and the service just calls it.
 *
 * Autosave is deliberately lenient (a draft is partial by definition); completion
 * is strict. Here we enforce the **minimum required set** is present AND every leaf
 * is a valid enum / integer-in-range, mirroring the `households` /
 * `household_preferences` / `user_food_preferences` CHECK/enum/type rules from
 * doc 01 — so the service rejects an incomplete or malformed draft with a typed
 * `ValidationError` (→ `VALIDATION_ERROR`, design/04 § 4.2) before the DB
 * transaction runs. The DB constraints stay the independent backstop.
 *
 * Optional fields are **normalized with their schema defaults applied here** (spice
 * `'medium'`, variety gap `7`, leftovers `true`, budget `'medium'`, adults/kids
 * `0`), so the SQL function receives a complete payload and only has to cast +
 * insert. Enum value sets come from the generated `Constants` so they can't drift.
 *
 * This is the completion counterpart to the wizard's presence-based
 * `isDraftComplete`/`missingRequiredFields` (lib/onboarding/completion.ts): the
 * client uses those to enable "Finish" (P2-5), the server re-checks here.
 */

import { Constants } from "@/lib/db/database.types";
import type { Database } from "@/lib/db/database.types";
import { ValidationError, type ValidationIssue } from "@/lib/errors";
import type { DraftData } from "@/lib/onboarding";
import { isUuid } from "@/lib/validation/uuid";

type DietType = Database["public"]["Enums"]["diet_type"];
type SpiceLevel = Database["public"]["Enums"]["spice_level"];
type BudgetPreference = Database["public"]["Enums"]["budget_preference"];
type MealSlot = Database["public"]["Enums"]["meal_slot"];
type MealFrequency = Database["public"]["Enums"]["meal_frequency"];

const DIET_TYPES = Constants.public.Enums.diet_type;
const SPICE_LEVELS = Constants.public.Enums.spice_level;
const BUDGET_PREFERENCES = Constants.public.Enums.budget_preference;
const MEAL_SLOTS = Constants.public.Enums.meal_slot;
const MEAL_FREQUENCIES = Constants.public.Enums.meal_frequency;

/** Mirrors the `create_household` name bound (doc 01 `households.name`). */
const MAX_HOUSEHOLD_NAME_LENGTH = 100;

/** Schema defaults for the optional preference fields (doc 01 column DEFAULTs). */
const DEFAULT_SPICE_LEVEL: SpiceLevel = "medium";
const DEFAULT_BUDGET_PREFERENCE: BudgetPreference = "medium";
const DEFAULT_VARIETY_GAP_DAYS = 7;
const DEFAULT_ALLOW_LEFTOVERS = true;

/** `households` insert payload (camelCase; the SQL fn reads these keys). */
export interface HouseholdPayload {
  name: string;
  locationCountry?: string;
  locationCity?: string;
}

/** `household_preferences` insert payload, fully normalized (defaults applied). */
export interface PreferencesPayload {
  familySize: number;
  adultsCount: number;
  kidsCount: number;
  dietType: DietType;
  preferredCuisines: string[];
  spiceLevel: SpiceLevel;
  weekdayCookingTimeMinutes: number;
  weekendCookingTimeMinutes?: number;
  mealsToPlan: MealSlot[];
  varietyGapDays: number;
  allowLeftovers: boolean;
  budgetPreference: BudgetPreference;
}

/** The owner's `user_food_preferences` payload (steps 3 + 4) — `null` when empty. */
export interface FoodPreferencesPayload {
  allergies: string[];
  dislikedIngredients: string[];
  healthPreferenceTags: string[];
  /** Preferred-dish names (BUG-006); become the owner's `liked_dishes`. */
  likedDishes: string[];
  spicePreference?: SpiceLevel;
}

/** One self-built dish (P10 `build` mode) the RPC writes household prefs from. */
export interface SelfBuiltDishPayload {
  dishName: string;
  frequency: MealFrequency;
  goesWith: string[];
}

/**
 * The P10 combination/build slice the RPC reads (`p_combination_prefs`): the
 * `combinations` mode's selected combo ids (popularity bump) and the `build`
 * mode's self-built dishes. `null` when the household chose `system`/`manual` or
 * picked nothing.
 */
export interface CombinationPrefsPayload {
  selectedCombinationIds: string[];
  builtDishes: SelfBuiltDishPayload[];
}

/** Everything `complete_onboarding` needs to write the live rows. */
export interface CompletionPayload {
  household: HouseholdPayload;
  preferences: PreferencesPayload;
  foodPreferences: FoodPreferencesPayload | null;
  combinationPrefs: CombinationPrefsPayload | null;
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isEnumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return (
    typeof value === "string" && (allowed as readonly string[]).includes(value)
  );
}

/** Trim each entry, drop blanks; returns `[]` for a non-array. */
function cleanStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Validate + normalize a draft into the completion payload, or throw a single
 * `ValidationError` collecting every problem (missing required field or invalid
 * leaf). On success the payload is complete: required fields are present and
 * valid, and optional fields carry their schema defaults.
 */
export function buildCompletionPayload(draft: DraftData): CompletionPayload {
  const issues: ValidationIssue[] = [];

  const basics = draft.householdBasics ?? {};
  const food = draft.foodPreferences ?? {};
  const preferred = draft.preferredDishes ?? {};
  const schedule = draft.mealSchedule ?? {};
  const health = draft.allergiesHealth ?? {};
  const budget = draft.budget ?? {};

  // ── households.name (required) ─────────────────────────────────────────────
  const name = typeof basics.name === "string" ? basics.name.trim() : "";
  if (name.length === 0) {
    issues.push({ field: "name", rule: "required" });
  } else if (name.length > MAX_HOUSEHOLD_NAME_LENGTH) {
    issues.push({
      field: "name",
      rule: "maxLength",
      max: MAX_HOUSEHOLD_NAME_LENGTH,
    });
  }

  // ── family_size (required, 1..50) ──────────────────────────────────────────
  const familySize = basics.familySize;
  if (!(isInteger(familySize) && familySize >= 1 && familySize <= 50)) {
    issues.push({ field: "familySize", rule: "range", min: 1, max: 50 });
  }

  // ── adults/kids counts (optional, >= 0, default 0) ─────────────────────────
  const adultsCount = normalizeCount(basics.adultsCount, "adultsCount", issues);
  const kidsCount = normalizeCount(basics.kidsCount, "kidsCount", issues);

  // ── diet_type (required enum) ──────────────────────────────────────────────
  const dietType = food.dietType;
  if (!isEnumValue(dietType, DIET_TYPES)) {
    issues.push({ field: "dietType", rule: "enum", allowed: DIET_TYPES });
  }

  // ── preferred_cuisines (required, >= 1) ────────────────────────────────────
  const preferredCuisines = cleanStringArray(food.preferredCuisines);
  if (preferredCuisines.length === 0) {
    issues.push({ field: "preferredCuisines", rule: "minItems", min: 1 });
  }

  // ── spice_level (optional enum, default 'medium') ──────────────────────────
  let spiceLevel: SpiceLevel = DEFAULT_SPICE_LEVEL;
  if (food.spiceLevel !== undefined) {
    if (isEnumValue(food.spiceLevel, SPICE_LEVELS)) {
      spiceLevel = food.spiceLevel;
    } else {
      issues.push({ field: "spiceLevel", rule: "enum", allowed: SPICE_LEVELS });
    }
  }

  // ── meals_to_plan (required, >= 1, all valid slots) ────────────────────────
  const mealsToPlan = normalizeMealsToPlan(schedule.mealsToPlan, issues);

  // ── weekday cooking time (required, > 0) ───────────────────────────────────
  const weekdayCookingTimeMinutes = schedule.weekdayCookingTimeMinutes;
  if (
    !(isInteger(weekdayCookingTimeMinutes) && weekdayCookingTimeMinutes > 0)
  ) {
    issues.push({ field: "weekdayCookingTimeMinutes", rule: "positiveInt" });
  }

  // ── weekend cooking time (optional, > 0; omitted if absent) ────────────────
  let weekendCookingTimeMinutes: number | undefined;
  if (schedule.weekendCookingTimeMinutes !== undefined) {
    const value = schedule.weekendCookingTimeMinutes;
    if (isInteger(value) && value > 0) {
      weekendCookingTimeMinutes = value;
    } else {
      issues.push({ field: "weekendCookingTimeMinutes", rule: "positiveInt" });
    }
  }

  // ── variety_gap_days (optional, 0..60, default 7) ──────────────────────────
  let varietyGapDays = DEFAULT_VARIETY_GAP_DAYS;
  if (schedule.varietyGapDays !== undefined) {
    const value = schedule.varietyGapDays;
    if (isInteger(value) && value >= 0 && value <= 60) {
      varietyGapDays = value;
    } else {
      issues.push({ field: "varietyGapDays", rule: "range", min: 0, max: 60 });
    }
  }

  // ── allow_leftovers (optional boolean, default true) ───────────────────────
  let allowLeftovers = DEFAULT_ALLOW_LEFTOVERS;
  if (schedule.allowLeftovers !== undefined) {
    if (typeof schedule.allowLeftovers === "boolean") {
      allowLeftovers = schedule.allowLeftovers;
    } else {
      issues.push({ field: "allowLeftovers", rule: "boolean" });
    }
  }

  // ── budget_preference (optional enum, default 'medium') ────────────────────
  let budgetPreference: BudgetPreference = DEFAULT_BUDGET_PREFERENCE;
  if (budget.budgetPreference !== undefined) {
    if (isEnumValue(budget.budgetPreference, BUDGET_PREFERENCES)) {
      budgetPreference = budget.budgetPreference;
    } else {
      issues.push({
        field: "budgetPreference",
        rule: "enum",
        allowed: BUDGET_PREFERENCES,
      });
    }
  }

  // ── owner food prefs (step 4, all optional) ────────────────────────────────
  let spicePreference: SpiceLevel | undefined;
  if (health.spicePreference !== undefined) {
    if (isEnumValue(health.spicePreference, SPICE_LEVELS)) {
      spicePreference = health.spicePreference;
    } else {
      issues.push({
        field: "spicePreference",
        rule: "enum",
        allowed: SPICE_LEVELS,
      });
    }
  }

  // Preferred dishes (step 3, P10) — validated here so a bad frequency/combo id
  // joins the same ValidationError; the resolved values are used after the gate.
  const { likedDishes, combinationPrefs } = resolvePreferredDishes(
    preferred,
    issues,
  );

  if (issues.length > 0) {
    throw new ValidationError(
      "Your household setup is incomplete or invalid.",
      issues,
    );
  }

  // Past validation every required leaf is sound; assert the narrowed types.
  const household: HouseholdPayload = { name };
  const locationCountry = optionalTrimmed(basics.locationCountry);
  if (locationCountry) household.locationCountry = locationCountry;
  const locationCity = optionalTrimmed(basics.locationCity);
  if (locationCity) household.locationCity = locationCity;

  const preferences: PreferencesPayload = {
    familySize: familySize as number,
    adultsCount,
    kidsCount,
    dietType: dietType as DietType,
    preferredCuisines,
    spiceLevel,
    weekdayCookingTimeMinutes: weekdayCookingTimeMinutes as number,
    mealsToPlan,
    varietyGapDays,
    allowLeftovers,
    budgetPreference,
  };
  if (weekendCookingTimeMinutes !== undefined) {
    preferences.weekendCookingTimeMinutes = weekendCookingTimeMinutes;
  }

  const allergies = cleanStringArray(health.allergies);
  const dislikedIngredients = cleanStringArray(health.dislikedIngredients);
  const healthPreferenceTags = cleanStringArray(health.healthPreferenceTags);
  // `likedDishes` / `combinationPrefs` were resolved above (before the gate).
  const hasFoodPrefs =
    allergies.length > 0 ||
    dislikedIngredients.length > 0 ||
    healthPreferenceTags.length > 0 ||
    likedDishes.length > 0 ||
    spicePreference !== undefined;
  const foodPreferences: FoodPreferencesPayload | null = hasFoodPrefs
    ? {
        allergies,
        dislikedIngredients,
        healthPreferenceTags,
        likedDishes,
        ...(spicePreference !== undefined ? { spicePreference } : {}),
      }
    : null;

  return { household, preferences, foodPreferences, combinationPrefs };
}

/** The preferred-dishes step (P10) is one slice of the draft; this is its shape. */
interface PreferredDishesSlice {
  mode?: string;
  dishNames?: unknown;
  selectedCombinationIds?: unknown;
  builtDishes?: unknown;
}

/**
 * Resolve the preferred-dishes step into the owner's `liked_dishes` and the RPC's
 * combination-prefs slice, validating any bad leaf into `issues` (P10). See the
 * mode table at the call site.
 */
function resolvePreferredDishes(
  preferred: PreferredDishesSlice,
  issues: ValidationIssue[],
): { likedDishes: string[]; combinationPrefs: CombinationPrefsPayload | null } {
  switch (preferred.mode) {
    case "system":
      return { likedDishes: [], combinationPrefs: null };

    case "combinations": {
      const ids = cleanStringArray(preferred.selectedCombinationIds);
      const valid: string[] = [];
      for (const id of ids) {
        if (isUuid(id)) valid.push(id);
        else issues.push({ field: "selectedCombinationIds", rule: "uuid" });
      }
      // De-dupe while preserving order.
      const unique = [...new Set(valid)];
      return {
        likedDishes: [],
        combinationPrefs:
          unique.length > 0
            ? { selectedCombinationIds: unique, builtDishes: [] }
            : null,
      };
    }

    case "build": {
      const builtDishes = normalizeBuiltDishes(preferred.builtDishes, issues);
      // The built mains also become liked_dishes so the engine's +10 bonus fires.
      const likedDishes = [...new Set(builtDishes.map((b) => b.dishName))];
      return {
        likedDishes,
        combinationPrefs:
          builtDishes.length > 0
            ? { selectedCombinationIds: [], builtDishes }
            : null,
      };
    }

    default:
      // Legacy `manual` (or unset): hand-picked dish names.
      return {
        likedDishes: cleanStringArray(preferred.dishNames),
        combinationPrefs: null,
      };
  }
}

/**
 * Normalize the `build`-mode self-built dishes: each needs a non-blank dish name
 * (de-duplicated) and a valid `meal_frequency`; `goesWith` is cleaned. A bad
 * frequency pushes a ValidationIssue and drops that entry.
 */
function normalizeBuiltDishes(
  value: unknown,
  issues: ValidationIssue[],
): SelfBuiltDishPayload[] {
  if (!Array.isArray(value)) return [];
  const out: SelfBuiltDishPayload[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const dishName =
      typeof record.dishName === "string" ? record.dishName.trim() : "";
    if (dishName.length === 0 || seen.has(dishName)) continue;
    const frequency = record.frequency;
    if (!isEnumValue(frequency, MEAL_FREQUENCIES)) {
      issues.push({
        field: "builtDishes.frequency",
        rule: "enum",
        allowed: MEAL_FREQUENCIES,
      });
      continue;
    }
    seen.add(dishName);
    // De-dupe accompaniments and drop the main itself if it sneaks in.
    const goesWith = [...new Set(cleanStringArray(record.goesWith))].filter(
      (name) => name !== dishName,
    );
    out.push({ dishName, frequency, goesWith });
  }
  return out;
}

/** Optional count: absent → default 0; present must be an integer ≥ 0. */
function normalizeCount(
  value: unknown,
  field: string,
  issues: ValidationIssue[],
): number {
  if (value === undefined) return 0;
  if (isInteger(value) && value >= 0) return value;
  issues.push({ field, rule: "min", min: 0 });
  return 0;
}

/** Required, ≥ 1, every entry a valid `meal_slot`. */
function normalizeMealsToPlan(
  value: unknown,
  issues: ValidationIssue[],
): MealSlot[] {
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((slot) => (MEAL_SLOTS as readonly string[]).includes(slot))
  ) {
    return value as MealSlot[];
  }
  issues.push({ field: "mealsToPlan", rule: "enumArray", allowed: MEAL_SLOTS });
  return [];
}

/** Trim a maybe-string; returns `undefined` for absent/blank. */
function optionalTrimmed(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
