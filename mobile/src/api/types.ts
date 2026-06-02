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

export type MemberRole = "owner" | "admin" | "member" | "viewer";

export type MembershipType = "permanent" | "temporary_guest";

export type MemberStatus =
  | "invited"
  | "active"
  | "declined"
  | "expired"
  | "removed"
  | "left";

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

/** Household preferences as the API exposes them (`PreferencesDto`). */
export interface HouseholdPreferences {
  familySize: number;
  adultsCount: number;
  kidsCount: number;
  /** The household's diet(s); multi-select (BETA). Always non-empty. */
  dietTypes: DietType[];
  /** @deprecated Legacy single diet, mirrors `dietTypes[0]`. */
  dietType: DietType;
  preferredCuisines: string[];
  spiceLevel: SpiceLevel;
  weekdayCookingTimeMinutes: number | null;
  weekendCookingTimeMinutes: number | null;
  mealsToPlan: MealSlot[];
  varietyGapDays: number;
  allowLeftovers: boolean;
  budgetPreference: BudgetPreference;
}

/** `PATCH .../preferences` body — any subset of the editable preference fields. */
export type PreferencesPatch = Partial<{
  familySize: number;
  adultsCount: number;
  kidsCount: number;
  dietTypes: DietType[];
  preferredCuisines: string[];
  spiceLevel: SpiceLevel;
  weekdayCookingTimeMinutes: number | null;
  weekendCookingTimeMinutes: number | null;
  mealsToPlan: MealSlot[];
  varietyGapDays: number;
  allowLeftovers: boolean;
  budgetPreference: BudgetPreference;
}>;

/** The caller's member-level food preferences (`MyFoodPreferencesDto`). */
export interface MyFoodPreferences {
  /** Dish names the household likes; feed the engine's liked-dish bonus. */
  likedDishes: string[];
}

/** `POST /api/households` response. */
export interface CreateHouseholdResult {
  householdId: string;
}

/** `DELETE /api/households/{id}` response — the caller's remaining households. */
export interface DeleteHouseholdResult {
  households: HouseholdSummary[];
}

/** The eight `can_*` permission flags in camelCase (`CanFlagsDto`). */
export interface CanFlags {
  canViewPlan: boolean;
  canSuggestMeals: boolean;
  canChangeTodayMenu: boolean;
  canChangeWeeklySchedule: boolean;
  canManageGroceryList: boolean;
  canInviteMembers: boolean;
  canRemoveMembers: boolean;
  canEditHouseholdPreferences: boolean;
}

/** The ordered `can_*` flag keys, for iterating permission toggles in the UI. */
export const CAN_FLAG_KEYS = [
  "canViewPlan",
  "canSuggestMeals",
  "canChangeTodayMenu",
  "canChangeWeeklySchedule",
  "canManageGroceryList",
  "canInviteMembers",
  "canRemoveMembers",
  "canEditHouseholdPreferences",
] as const satisfies readonly (keyof CanFlags)[];

/** The caller's own role + permissions, embedded in the household read. */
export interface CurrentUserPermissions extends CanFlags {
  role: MemberRole;
  membershipType: MembershipType;
}

/** One household member (`MemberDto`, `GET .../members` `data[]` item). */
export interface Member {
  memberId: string;
  userId: string;
  /** Null until the user sets a name. */
  displayName: string | null;
  role: MemberRole;
  membershipType: MembershipType;
  status: MemberStatus;
  /** Null for permanent members; a deadline for temporary guests. */
  expiresAt: string | null;
  joinedAt: string | null;
  permissions: CanFlags;
}

/** `PATCH .../members/{memberId}` body — a role change and/or flag overrides. */
export interface UpdateMemberInput {
  role?: MemberRole;
  permissions?: Partial<CanFlags>;
}

/** `POST .../members/{memberId}/remove` response. */
export interface RemoveMemberResult {
  memberId: string;
  status: "removed";
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

// ───────────────────────────── invites (M2-4) ─────────────────────────────

/** Roles an invite may grant (owner is reached only via transfer). */
export type InvitableRole = "admin" | "member" | "viewer";

/** `POST .../invites` body — at least one of email / phone is required. */
export interface CreateInviteInput {
  email?: string;
  phone?: string;
  role?: InvitableRole;
  membershipType?: MembershipType;
  /** ISO instant; required for a `temporary_guest`, defaulted for permanent. */
  expiresAt?: string;
}

/** `POST .../invites` response — the link carries the plaintext token, shown once. */
export interface CreateInviteResult {
  inviteId: string;
  inviteLink: string;
  emailStatus: string;
}

/** One pending invite (`PendingInviteDto`, `GET .../invites` `data[]` item). */
export interface PendingInvite {
  inviteId: string;
  invitedEmail: string | null;
  invitedPhone: string | null;
  role: MemberRole;
  membershipType: MembershipType;
  expiresAt: string;
  createdAt: string;
}

/** Unauthenticated invite preview (`GET /api/invites/{token}`). */
export interface InvitePreview {
  householdName: string;
  invitedBy: string | null;
  membershipType: MembershipType;
  role: MemberRole;
  expiresAt: string;
}

/** `POST /api/invites/{token}/accept` response. */
export interface AcceptInviteResult {
  householdId: string;
  membershipStatus: "active";
}

/** `POST /api/invites/{token}/decline` response. */
export interface DeclineInviteResult {
  status: "declined";
}
