import { apiRequest } from "./client";
import type { GroceryItem, GroceryList, GroceryScreen } from "./types";

/**
 * Grocery-list endpoints (design/10 § 6). The list is keyed to a meal plan;
 * regenerate sends a reusable `Idempotency-Key` (design/04 § 3). Checking an item
 * off is a `PATCH` on the line.
 */

/**
 * The grocery screen for the household's current plan, resolved server-side
 * (`{ plan, list }`). Lets the client show the list without first knowing the
 * `mealPlanId`, and still offer "generate" when a plan has no list yet.
 */
export function getGroceryScreen(householdId: string): Promise<GroceryScreen> {
  return apiRequest<GroceryScreen>(
    `/api/households/${householdId}/grocery-list/current`,
  );
}

export function getGroceryList(
  householdId: string,
  mealPlanId: string,
): Promise<GroceryList> {
  return apiRequest<GroceryList>(
    `/api/households/${householdId}/grocery-list`,
    { query: { mealPlanId } },
  );
}

export function regenerateGroceryList(
  householdId: string,
  mealPlanId: string,
  idempotencyKey: string,
): Promise<GroceryList> {
  return apiRequest<GroceryList>(
    `/api/households/${householdId}/grocery-list/regenerate`,
    { method: "POST", body: { mealPlanId }, idempotencyKey },
  );
}

export function setGroceryItemChecked(
  groceryListItemId: string,
  checked: boolean,
): Promise<GroceryItem> {
  return apiRequest<GroceryItem>(
    `/api/grocery-list-items/${groceryListItemId}`,
    { method: "PATCH", body: { checked } },
  );
}
