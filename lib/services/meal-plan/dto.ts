/**
 * `mealPlan` service DTOs — the snake_case-row → camelCase-payload translation
 * boundary (design/04 § 1). Pure mappers, no I/O, so the services produce
 * client-ready DTOs and the route handlers only serialize. Shared by today's
 * generation (P5-1), weekly generation (P5-3), the item actions (P5-2/4/5/6),
 * and the meal-history read (P5-7) so the wire shapes stay identical.
 *
 * Enum **values** pass through unchanged — they are data, not naming convention.
 */

import type { Database } from "@/lib/db/database.types";

type MealSlot = Database["public"]["Enums"]["meal_slot"];
type MealItemStatus = Database["public"]["Enums"]["meal_item_status"];
type MealPlanStatus = Database["public"]["Enums"]["meal_plan_status"];
type ImageStatus = Database["public"]["Enums"]["image_status"];
type PairingType = Database["public"]["Enums"]["pairing_type"];

/**
 * A component that completes a primary dish into a wholesome package
 * (BUG-008/009/010, design/08 criterion 10): a starch base and/or a condiment
 * the engine pairs with a `main_component`, e.g. Rajma Masala **+ Steamed Rice**.
 * Resolved for display only — the planned `meal_plan_items` row still stores the
 * single primary dish.
 */
export interface PairedDishDto {
  dishId: string;
  dishName: string;
  pairingType: PairingType;
}

/** The `meal_plan_items` columns the API projects, plus the optional joined dish. */
export interface MealPlanItemRow {
  id: string;
  meal_plan_id: string;
  date: string;
  meal_slot: MealSlot;
  dish_id: string | null;
  status: MealItemStatus;
  locked: boolean;
  reason: string | null;
  changed_by_user_id: string | null;
  /** Present when the query joins `dishes(...)`; the dish may be archived/absent. */
  dishes?: {
    name: string;
    image_url: string | null;
    image_alt_text: string | null;
    image_status: ImageStatus;
  } | null;
}

/** One planned meal cell as the API exposes it (design/04 § 4.5). */
export interface MealPlanItemDto {
  mealPlanItemId: string;
  mealPlanId: string;
  date: string;
  mealSlot: MealSlot;
  dishId: string | null;
  /** Null for an eating-out slot, or when the dish is no longer an active row. */
  dishName: string | null;
  dishImageUrl: string | null;
  dishImageAltText: string | null;
  dishImageStatus: ImageStatus | null;
  status: MealItemStatus;
  locked: boolean;
  reason: string | null;
  changedByUserId: string | null;
  /**
   * Accompaniments that make this a complete package (BUG-008/009/010). Empty by
   * default; populated by the server-only `attachPackages` step after mapping.
   */
  pairedDishes: PairedDishDto[];
}

/**
 * Map a `meal_plan_items` row to its DTO. `dishName` comes from a joined
 * `dishes(name)` when present; pass it explicitly to override (e.g. a name the
 * caller already resolved from the candidate set during generation).
 *
 * `pairedDishes` defaults to `[]` — package resolution needs a DB lookup, so the
 * server-only `attachPackages` helper fills it in after this pure mapping.
 */
export function toMealPlanItemDto(
  row: MealPlanItemRow,
  dishName?: string | null,
  dishImage?: {
    imageUrl: string | null;
    imageAltText: string | null;
    imageStatus: ImageStatus;
  } | null,
): MealPlanItemDto {
  return {
    mealPlanItemId: row.id,
    mealPlanId: row.meal_plan_id,
    date: row.date,
    mealSlot: row.meal_slot,
    dishId: row.dish_id,
    dishName: dishName !== undefined ? dishName : (row.dishes?.name ?? null),
    dishImageUrl:
      dishImage !== undefined
        ? (dishImage?.imageUrl ?? null)
        : (row.dishes?.image_url ?? null),
    dishImageAltText:
      dishImage !== undefined
        ? (dishImage?.imageAltText ?? null)
        : (row.dishes?.image_alt_text ?? null),
    dishImageStatus:
      dishImage !== undefined
        ? (dishImage?.imageStatus ?? null)
        : (row.dishes?.image_status ?? null),
    status: row.status,
    locked: row.locked,
    reason: row.reason,
    changedByUserId: row.changed_by_user_id,
    pairedDishes: [],
  };
}

/** A runner-up suggestion returned alongside today's pick (design/08 § 2). */
export interface AlternativeDto {
  dishId: string;
  dishName: string | null;
  dishImageUrl: string | null;
  dishImageAltText: string | null;
  dishImageStatus: ImageStatus | null;
  score: number;
  reason: string;
  /** Package accompaniments for this alternative; filled by `attachPackages`. */
  pairedDishes: PairedDishDto[];
}

/** Response for `POST .../meal-plans/today/generate` (design/08 § 2). */
export interface TodayGenerateResult {
  mealPlanId: string;
  /** Null when no candidate dish passed the hard filters for the slot. */
  mealPlanItem: MealPlanItemDto | null;
  alternatives: AlternativeDto[];
}

/** Response for reject — the affected item plus alternatives (design/08 § 2). */
export interface RejectResult {
  mealPlanItem: MealPlanItemDto;
  alternatives: AlternativeDto[];
}

/** Response for replace — the swapped item plus whether grocery needs a refresh. */
export interface ReplaceResult {
  mealPlanItem: MealPlanItemDto;
  groceryListUpdated: boolean;
}

/** Response for `POST .../meal-plans/week/generate` (design/04 § 4.5). */
export interface WeekGenerateResult {
  mealPlanId: string;
  status: MealPlanStatus;
  startDate: string;
  endDate: string;
  itemCount: number;
}

/** A `meal_plans` row as the API exposes it (used by the plan reads). */
export interface MealPlanDto {
  mealPlanId: string;
  status: MealPlanStatus;
  startDate: string;
  endDate: string;
}

export interface MealPlanRow {
  id: string;
  status: MealPlanStatus;
  start_date: string;
  end_date: string;
}

export function toMealPlanDto(row: MealPlanRow): MealPlanDto {
  return {
    mealPlanId: row.id,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
  };
}
