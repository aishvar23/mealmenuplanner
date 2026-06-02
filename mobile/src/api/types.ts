/**
 * Wire-format types for the `/api/*` contract (design/10 § 4). The backend DTOs
 * in `lib/services/<domain>/dto.ts` and `lib/meal-plan/nutrition.ts` are the
 * source of truth; these mirror the camelCase shapes the API sends so it's typed
 * end-to-end. They are hand-authored (not generated) because the web DTO modules
 * use the web's `@/` alias and pull the full DB type surface, which the mobile
 * compiler can't resolve — keep this file in lockstep when those DTOs change.
 *
 * Enum-valued fields use string unions matching the DB enums; unknown future
 * values would still parse (the UI treats them defensively).
 */

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export type DietType =
  | "vegetarian"
  | "vegan"
  | "eggetarian"
  | "non_vegetarian"
  | "jain"
  | "pescatarian";

export type SpiceLevel = "mild" | "medium" | "spicy";

export type BudgetPreference = "low" | "medium" | "high";

export type DraftStatus = "in_progress" | "completed" | "abandoned";

export type MealItemStatus =
  | "suggested"
  | "accepted"
  | "rejected"
  | "eating_out"
  | "cooked";

export type ImageStatus = "pending" | "ready" | "failed";

export type PairingType = "starch_base" | "condiment";

export type FeedbackType =
  | "disliked"
  | "too_healthy"
  | "too_spicy"
  | "too_involved"
  | "do_not_suggest_again"
  | "other";

export type MemberRole = "owner" | "admin" | "member" | "guest";

/** Per-serving nutrition (P11). Every field independently nullable. */
export interface DishNutrition {
  servingQty: number | null;
  servingUnit: string | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  glycemicIndex: number | null;
}

/** A starch base / condiment that completes a main dish into a package. */
export interface PairedDish {
  dishId: string;
  dishName: string;
  pairingType: PairingType;
  nutrition: DishNutrition | null;
}

/** One planned meal cell (`MealPlanItemDto`). */
export interface MealPlanItem {
  mealPlanItemId: string;
  mealPlanId: string;
  date: string;
  mealSlot: MealSlot;
  dishId: string | null;
  dishName: string | null;
  dishImageUrl: string | null;
  dishImageAltText: string | null;
  dishImageStatus: ImageStatus | null;
  status: MealItemStatus;
  locked: boolean;
  reason: string | null;
  nutrition: DishNutrition | null;
  eatingOutNote: string | null;
  changedByUserId: string | null;
  pairedDishes: PairedDish[];
}

/** A prep task surfaced on a candidate (needs advance prep, e.g. soaking). */
export interface AlternativePrepTask {
  taskName: string;
  requiredBeforeMinutes: number;
}

/** A runner-up / candidate suggestion (`AlternativeDto`). */
export interface Alternative {
  dishId: string;
  dishName: string | null;
  dishImageUrl: string | null;
  dishImageAltText: string | null;
  dishImageStatus: ImageStatus | null;
  nutrition: DishNutrition | null;
  score: number;
  reason: string;
  pairedDishes: PairedDish[];
  prepTasks: AlternativePrepTask[];
}

/** `GET .../meal-plans/today` and the day read. */
export interface DayPlan {
  date: string;
  items: MealPlanItem[];
}

/** `GET .../meal-plans/week`. */
export interface WeekPlan {
  startDate: string;
  endDate: string;
  items: MealPlanItem[];
}

/** `POST .../meal-plans/today/generate` and `suggest-another`. */
export interface TodayGenerateResult {
  mealPlanId: string;
  mealPlanItem: MealPlanItem | null;
  alternatives: Alternative[];
}

/** `POST .../reject`. */
export interface RejectResult {
  mealPlanItem: MealPlanItem;
  alternatives: Alternative[];
}

/** `POST .../replace`. */
export interface ReplaceResult {
  mealPlanItem: MealPlanItem;
  groceryListUpdated: boolean;
}

/** `POST .../meal-plans/week/generate`. */
export interface WeekGenerateResult {
  mealPlanId: string;
  status: "active" | "archived";
  startDate: string;
  endDate: string;
  itemCount: number;
}

/** `GET .../candidates`. */
export interface CandidatesResult {
  candidates: Alternative[];
}

/** One household the caller is an active member of (`UserHouseholdSummary`). */
export interface HouseholdSummary {
  householdId: string;
  name: string;
  role: MemberRole;
  isActive: boolean;
  isPreferred: boolean;
}

/**
 * Household preferences the daily loop needs (`PreferencesDto` subset). The DTO
 * carries more fields; the app reads only what it renders/acts on.
 */
export interface HouseholdPreferences {
  mealsToPlan: string[];
  varietyGapDays: number;
}

/** The caller's own permissions, embedded in the household read (`can_*` subset). */
export interface CurrentUserPermissions {
  role: MemberRole;
  canChangeTodayMenu: boolean;
  canChangeWeeklySchedule: boolean;
  canManageGroceryList: boolean;
}

/** `GET /api/households/{householdId}` (`HouseholdDto` subset). */
export interface Household {
  id: string;
  name: string;
  preferences: HouseholdPreferences | null;
  currentUserPermissions: CurrentUserPermissions;
}

/** One grocery line (`GroceryItemDto`). */
export interface GroceryItem {
  groceryListItemId: string;
  ingredientId: string | null;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  checked: boolean;
  ingredientImageUrl: string | null;
  ingredientImageAltText: string | null;
  ingredientImageStatus: ImageStatus | null;
}

/** `GET .../grocery-list` and the regenerate response. */
export interface GroceryList {
  groceryListId: string;
  mealPlanId: string;
  status: "active" | "archived";
  items: GroceryItem[];
}

/** The plan a grocery list is built from (`GroceryPlanRef`). */
export interface GroceryPlanRef {
  mealPlanId: string;
  startDate: string;
  endDate: string;
}

/** `GET .../grocery-list/current` — the current plan + its list (either may be null). */
export interface GroceryScreen {
  plan: GroceryPlanRef | null;
  list: GroceryList | null;
}

/** `POST /api/onboarding/complete` — promotes a draft into a live household. */
export interface OnboardingCompleteResult {
  householdId: string;
  status: DraftStatus;
}
