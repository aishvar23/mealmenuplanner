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

type DietType = Database["public"]["Enums"]["diet_type"];
type SpiceLevel = Database["public"]["Enums"]["spice_level"];
type BudgetPreference = Database["public"]["Enums"]["budget_preference"];
type MealSlot = Database["public"]["Enums"]["meal_slot"];

const DIET_TYPES = Constants.public.Enums.diet_type;
const SPICE_LEVELS = Constants.public.Enums.spice_level;
const BUDGET_PREFERENCES = Constants.public.Enums.budget_preference;
const MEAL_SLOTS = Constants.public.Enums.meal_slot;

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

/** Everything `complete_onboarding` needs to write the live rows. */
export interface CompletionPayload {
  household: HouseholdPayload;
  preferences: PreferencesPayload;
  foodPreferences: FoodPreferencesPayload | null;
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
  // Preferred dishes (step 3): only "manual" picks carry liked dishes; choosing
  // "let the system decide" leaves them empty (BUG-006, PREFDISH-002).
  const likedDishes =
    preferred.mode === "system" ? [] : cleanStringArray(preferred.dishNames);
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

  return { household, preferences, foodPreferences };
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
