/**
 * `grocery` service DTOs — the snake_case-row → camelCase-payload boundary
 * (design/04 § 1, § 4.6). Pure mappers (no I/O), so the route handlers only
 * serialize and client components can `import type` these shapes. Shared by the
 * GET read (P7-2), the regenerate response (P7-3), and the check-off response.
 *
 * Enum **values** pass through unchanged — they are data, not naming convention.
 */

import type { Database } from "@/lib/db/database.types";

type GroceryListStatus = Database["public"]["Enums"]["grocery_list_status"];

/** The `grocery_list_items` columns the API projects. */
export interface GroceryItemRow {
  id: string;
  ingredient_id: string | null;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  checked: boolean;
}

/** The `grocery_lists` columns the API projects. */
export interface GroceryListRow {
  id: string;
  meal_plan_id: string;
  status: GroceryListStatus;
}

/** One grocery line as the API exposes it (design/04 § 4.6). */
export interface GroceryItemDto {
  groceryListItemId: string;
  /** Null for a manual ad-hoc item (no catalog ingredient). */
  ingredientId: string | null;
  name: string;
  /** `ingredients.category`, snapshotted at generation time. */
  category: string;
  quantity: number;
  unit: string;
  checked: boolean;
}

/** A grocery list with its lines (design/04 § 4.6). Items are category-ordered. */
export interface GroceryListDto {
  groceryListId: string;
  mealPlanId: string;
  status: GroceryListStatus;
  items: GroceryItemDto[];
}

export function toGroceryItemDto(row: GroceryItemRow): GroceryItemDto {
  return {
    groceryListItemId: row.id,
    ingredientId: row.ingredient_id,
    name: row.name,
    category: row.category,
    quantity: row.quantity,
    unit: row.unit,
    checked: row.checked,
  };
}

/** Assemble the list DTO from its row plus its (already category-ordered) items. */
export function toGroceryListDto(
  list: GroceryListRow,
  items: readonly GroceryItemRow[],
): GroceryListDto {
  return {
    groceryListId: list.id,
    mealPlanId: list.meal_plan_id,
    status: list.status,
    items: items.map(toGroceryItemDto),
  };
}
