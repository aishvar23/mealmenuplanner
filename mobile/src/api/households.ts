import { apiRequest, getCollection } from "./client";
import type { Household, HouseholdSummary } from "./types";

/**
 * Household discovery (design/10 § 6). `GET /api/households` returns the caller's
 * active households in the collection envelope; the app picks one to operate on
 * (see `useActiveHousehold`).
 */
export async function listHouseholds(): Promise<HouseholdSummary[]> {
  const { data } = await getCollection<HouseholdSummary>("/api/households");
  return data;
}

/**
 * `GET /api/households/{householdId}` — the household's preferences (which slots
 * to plan) and the caller's `can_*` permissions, used to drive the daily loop.
 */
export function getHousehold(householdId: string): Promise<Household> {
  return apiRequest<Household>(`/api/households/${householdId}`);
}
