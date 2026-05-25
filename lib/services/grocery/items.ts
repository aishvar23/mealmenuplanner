import "server-only";

import {
  getActiveMembership,
  hasPermission,
  requireAuthUser,
} from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { ForbiddenError, InternalError, NotFoundError } from "@/lib/errors";
import { isUuid } from "@/lib/validation";

import {
  toGroceryItemDto,
  type GroceryItemDto,
  type GroceryItemRow,
} from "./dto";

/**
 * `grocery` service — check a grocery item off (design/08 § 9 "Checking items
 * off", P7-2). Addressed by item id like the meal-plan item actions; resolves the
 * household from the item's parent list (design/04 § 1). A row hidden by RLS
 * (`gli_select` requires active membership) reads back null → 404, giving
 * existence-hiding for free. Flipping `checked` is part of managing the list, so
 * it requires `can_manage_grocery_list` (matching the `gli_write` backstop).
 */

const ITEM_SELECT =
  "id, ingredient_id, name, category, quantity, unit, checked, ingredients(image_url, image_alt_text, image_status)";

export async function setGroceryItemChecked(
  itemId: string,
  checked: boolean,
): Promise<GroceryItemDto> {
  await requireAuthUser();
  if (!isUuid(itemId)) throw new NotFoundError("Grocery item not found.");

  const supabase = await createServerSupabaseClient();

  const { data: item, error } = await supabase
    .from("grocery_list_items")
    .select("id, grocery_lists(household_id)")
    .eq("id", itemId)
    .maybeSingle();
  if (error) {
    throw new InternalError("Failed to load the grocery item.", {
      cause: error,
    });
  }
  if (!item) throw new NotFoundError("Grocery item not found.");

  const householdId = (item.grocery_lists as { household_id: string } | null)
    ?.household_id;
  if (!householdId) throw new NotFoundError("Grocery item not found.");

  const membership = await getActiveMembership(householdId);
  if (!membership) throw new NotFoundError("Grocery item not found.");
  if (!hasPermission(membership, "can_manage_grocery_list")) {
    throw new ForbiddenError(
      "You don't have permission to manage the grocery list.",
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from("grocery_list_items")
    .update({ checked })
    .eq("id", itemId)
    .select(ITEM_SELECT)
    .maybeSingle();
  if (updateError || !updated) {
    throw new InternalError("Failed to update the grocery item.", {
      cause: updateError,
    });
  }

  return toGroceryItemDto(updated as GroceryItemRow);
}
