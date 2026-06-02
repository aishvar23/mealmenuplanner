import { apiRequest, getCollection } from "./client";
import type {
  CreateHouseholdResult,
  DeleteHouseholdResult,
  Household,
  HouseholdPreferences,
  HouseholdSummary,
  Member,
  MyFoodPreferences,
  PreferencesPatch,
  RemoveMemberResult,
  UpdateMemberInput,
} from "./types";

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

// ─────────────────────── create / delete / prefs (M2-3) ───────────────────────

/** `POST /api/households` — create a household; the caller becomes its owner. */
export function createHousehold(name: string): Promise<CreateHouseholdResult> {
  return apiRequest<CreateHouseholdResult>("/api/households", {
    method: "POST",
    body: { name },
  });
}

/**
 * `DELETE /api/households/{id}` — permanently delete a household (owner-only).
 * Returns the caller's remaining households so the switcher updates in place.
 */
export function deleteHousehold(
  householdId: string,
): Promise<DeleteHouseholdResult> {
  return apiRequest<DeleteHouseholdResult>(`/api/households/${householdId}`, {
    method: "DELETE",
  });
}

/**
 * `PATCH .../preferences` — partial update of household preferences, gated by
 * `can_edit_household_preferences`. Returns the full updated preferences.
 */
export function updatePreferences(
  householdId: string,
  patch: PreferencesPatch,
): Promise<HouseholdPreferences> {
  return apiRequest<HouseholdPreferences>(
    `/api/households/${householdId}/preferences`,
    { method: "PATCH", body: patch },
  );
}

/**
 * `GET .../food-preferences` — the caller's own liked dish names (additive read
 * for mobile). Self-scoped; an empty list when none are set.
 */
export function getMyFoodPreferences(
  householdId: string,
): Promise<MyFoodPreferences> {
  return apiRequest<MyFoodPreferences>(
    `/api/households/${householdId}/food-preferences`,
  );
}

/**
 * `PATCH .../food-preferences` — replace the caller's liked dish names (self-write,
 * gated by active membership). Returns the updated list.
 */
export function updateMyFoodPreferences(
  householdId: string,
  likedDishes: string[],
): Promise<MyFoodPreferences> {
  return apiRequest<MyFoodPreferences>(
    `/api/households/${householdId}/food-preferences`,
    { method: "PATCH", body: { likedDishes } },
  );
}

// ───────────────────────────── members (M2-2) ─────────────────────────────

const membersBase = (householdId: string) =>
  `/api/households/${householdId}/members`;

/**
 * `GET /api/households/{householdId}/members` — the household roster (design/04
 * § 4.4). Bounded set, so the collection envelope carries no cursor.
 */
export async function listMembers(householdId: string): Promise<Member[]> {
  const { data } = await getCollection<Member>(membersBase(householdId));
  return data;
}

/**
 * `PATCH .../members/{memberId}` — change a member's role and/or `can_*` flags
 * (gated server-side by `can_remove_members`). The wire body is flat: `role` plus
 * any camelCase flag keys, so we spread `permissions` to the top level. Setting
 * `role: "owner"` triggers an ownership transfer server-side.
 */
export function updateMember(
  householdId: string,
  memberId: string,
  input: UpdateMemberInput,
): Promise<Member> {
  return apiRequest<Member>(`${membersBase(householdId)}/${memberId}`, {
    method: "PATCH",
    body: {
      ...(input.role ? { role: input.role } : {}),
      ...input.permissions,
    },
  });
}

/**
 * `POST .../members/{memberId}/remove` — remove a member (soft `active → removed`;
 * gated by `can_remove_members`). `409` for removing the owner or yourself.
 */
export function removeMember(
  householdId: string,
  memberId: string,
): Promise<RemoveMemberResult> {
  return apiRequest<RemoveMemberResult>(
    `${membersBase(householdId)}/${memberId}/remove`,
    { method: "POST" },
  );
}
