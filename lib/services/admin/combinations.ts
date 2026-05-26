import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireAdmin } from "@/lib/auth";
import type { Database } from "@/lib/db/database.types";
import { createServiceRoleClient } from "@/lib/db/service-role";
import { InternalError, NotFoundError } from "@/lib/errors";
import { isUuid } from "@/lib/validation";

/**
 * `admin` service — meal-combination review (P10-5).
 *
 * Households promote their self-built plates into the global catalog as
 * `proposed` combinations via the daily-approval hook (`safeProposeCombination`,
 * mealPlan service). The operator reviews that queue here and moves each combo to
 * `active` (it then surfaces in the onboarding picker + feeds the engine) or
 * `rejected`. Like the rest of the admin service, every function gates on
 * `requireAdmin()` (design/03 § 5) and runs on the **service-role client** — the
 * one user-facing path the service-role client is sanctioned for, and the only way
 * to read non-`active` (proposed/rejected) combos and the proposer's display name
 * (`users` is RLS self-only). The `app_role` write-RLS stays the in-band backstop.
 */

type CombinationStatus = Database["public"]["Enums"]["combination_status"];
type DietType = Database["public"]["Enums"]["diet_type"];
type AdminClient = SupabaseClient<Database>;

/** Max combinations returned by a list (the console paginates client-side). */
const COMBINATION_LIST_LIMIT = 200;

/** One member dish of a combination, as the review card renders it. */
export interface CombinationItemDto {
  dishId: string;
  dishName: string | null;
  roleInCombo: string | null;
  sortOrder: number;
}

/** A meal combination with everything the operator review queue needs. */
export interface CombinationDto {
  id: string;
  name: string;
  description: string | null;
  cuisine: string | null;
  region: string | null;
  dietType: DietType;
  status: CombinationStatus;
  popularityCount: number;
  /** `'admin'` (seeded/authored) or `'user_proposed'` (promoted from a household). */
  source: string;
  proposedByUserName: string | null;
  proposedByHouseholdName: string | null;
  createdAt: string;
  items: CombinationItemDto[];
}

const COMBINATION_SELECT =
  "id, name, description, cuisine, region, diet_type, status, popularity_count, source, proposed_by_user_id, proposed_by_household_id, created_at";

interface CombinationRow {
  id: string;
  name: string;
  description: string | null;
  cuisine: string | null;
  region: string | null;
  diet_type: DietType;
  status: CombinationStatus;
  popularity_count: number;
  source: string;
  proposed_by_user_id: string | null;
  proposed_by_household_id: string | null;
  created_at: string;
}

/**
 * List combinations of a given status (default `proposed` — the review queue).
 * Proposed combos are ordered oldest-first (FIFO review); any other status is
 * ordered by popularity then name, mirroring the onboarding picker.
 */
export async function listCombinations(
  status: CombinationStatus = "proposed",
): Promise<CombinationDto[]> {
  await requireAdmin();
  const supabase = createServiceRoleClient();

  let query = supabase
    .from("meal_combinations")
    .select(COMBINATION_SELECT)
    .eq("status", status)
    .limit(COMBINATION_LIST_LIMIT);

  query =
    status === "proposed"
      ? query.order("created_at", { ascending: true })
      : query
          .order("popularity_count", { ascending: false })
          .order("name", { ascending: true });

  const { data, error } = await query;
  if (error) {
    throw new InternalError("Failed to load meal combinations.", {
      cause: error,
    });
  }

  return hydrateCombinations(supabase, (data ?? []) as CombinationRow[]);
}

/** Approve a proposed combination → `active` (P10-5). Returns the refreshed DTO. */
export async function approveCombination(
  combinationId: string,
): Promise<CombinationDto> {
  return setCombinationStatus(combinationId, "active");
}

/** Reject a proposed combination → `rejected` (P10-5). Returns the refreshed DTO. */
export async function rejectCombination(
  combinationId: string,
): Promise<CombinationDto> {
  return setCombinationStatus(combinationId, "rejected");
}

/** Transition a combination's status; 404s a missing id. */
export async function setCombinationStatus(
  combinationId: string,
  status: CombinationStatus,
): Promise<CombinationDto> {
  if (!isUuid(combinationId)) {
    throw new NotFoundError("Meal combination not found.");
  }
  await requireAdmin();
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("meal_combinations")
    .update({ status })
    .eq("id", combinationId)
    .select(COMBINATION_SELECT)
    .maybeSingle();

  if (error) {
    throw new InternalError("Failed to update meal combination status.", {
      cause: error,
    });
  }
  if (!data) throw new NotFoundError("Meal combination not found.");

  const [dto] = await hydrateCombinations(supabase, [data as CombinationRow]);
  if (!dto) throw new NotFoundError("Meal combination not found.");
  return dto;
}

// ─────────────────────────── internal hydration ───────────────────────────
// Resolve each combo's member dishes + the proposer/household display names via
// separate id→name lookups (the admin/client.ts philosophy: no embedded FK-hint
// joins, so the queries stay type-stable and trivially mockable).

async function hydrateCombinations(
  supabase: AdminClient,
  rows: CombinationRow[],
): Promise<CombinationDto[]> {
  if (rows.length === 0) return [];

  const comboIds = rows.map((row) => row.id);
  const userIds = collectIds(rows.map((row) => row.proposed_by_user_id));
  const householdIds = collectIds(
    rows.map((row) => row.proposed_by_household_id),
  );

  const [itemsByCombo, userNames, householdNames] = await Promise.all([
    loadCombinationItems(supabase, comboIds),
    resolveUserNames(supabase, userIds),
    resolveHouseholdNames(supabase, householdIds),
  ]);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    cuisine: row.cuisine,
    region: row.region,
    dietType: row.diet_type,
    status: row.status,
    popularityCount: row.popularity_count,
    source: row.source,
    proposedByUserName: row.proposed_by_user_id
      ? (userNames.get(row.proposed_by_user_id) ?? null)
      : null,
    proposedByHouseholdName: row.proposed_by_household_id
      ? (householdNames.get(row.proposed_by_household_id) ?? null)
      : null,
    createdAt: row.created_at,
    items: itemsByCombo.get(row.id) ?? [],
  }));
}

interface CombinationItemRow {
  combination_id: string;
  dish_id: string;
  role_in_combo: string | null;
  sort_order: number;
}

async function loadCombinationItems(
  supabase: AdminClient,
  comboIds: string[],
): Promise<Map<string, CombinationItemDto[]>> {
  const { data, error } = await supabase
    .from("meal_combination_items")
    .select("combination_id, dish_id, role_in_combo, sort_order")
    .in("combination_id", comboIds);

  if (error) {
    throw new InternalError("Failed to load combination items.", {
      cause: error,
    });
  }
  const rows = (data ?? []) as CombinationItemRow[];

  const dishNames = await resolveDishNames(
    supabase,
    collectIds(rows.map((row) => row.dish_id)),
  );

  const byCombo = new Map<string, CombinationItemDto[]>();
  for (const row of rows) {
    const item: CombinationItemDto = {
      dishId: row.dish_id,
      dishName: dishNames.get(row.dish_id) ?? null,
      roleInCombo: row.role_in_combo,
      sortOrder: row.sort_order,
    };
    const list = byCombo.get(row.combination_id);
    if (list) list.push(item);
    else byCombo.set(row.combination_id, [item]);
  }
  // Render each combo's dishes in their stored sort order.
  for (const list of byCombo.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  return byCombo;
}

async function resolveDishNames(
  supabase: AdminClient,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from("dishes")
    .select("id, name")
    .in("id", ids);
  if (error) {
    throw new InternalError("Failed to resolve dish names.", { cause: error });
  }
  return new Map((data ?? []).map((row) => [row.id, row.name]));
}

async function resolveUserNames(
  supabase: AdminClient,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from("users")
    .select("id, display_name")
    .in("id", ids);
  if (error) {
    throw new InternalError("Failed to resolve proposer names.", {
      cause: error,
    });
  }
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.display_name) map.set(row.id, row.display_name);
  }
  return map;
}

async function resolveHouseholdNames(
  supabase: AdminClient,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from("households")
    .select("id, name")
    .in("id", ids);
  if (error) {
    throw new InternalError("Failed to resolve household names.", {
      cause: error,
    });
  }
  return new Map((data ?? []).map((row) => [row.id, row.name]));
}

/** De-dupe a list of maybe-null ids into a clean array. */
function collectIds(ids: (string | null)[]): string[] {
  return [...new Set(ids.filter((id): id is string => id !== null))];
}
