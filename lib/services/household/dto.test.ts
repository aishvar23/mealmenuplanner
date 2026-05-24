import { describe, expect, it } from "vitest";

import type { MembershipContext } from "@/lib/auth/permissions";
import {
  toCanFlagsDto,
  toCurrentUserPermissionsDto,
  toPreferencesDto,
  type PreferencesRow,
} from "@/lib/services/household/dto";

const PREFERENCES_ROW: PreferencesRow = {
  family_size: 4,
  adults_count: 2,
  kids_count: 2,
  diet_type: "vegetarian",
  preferred_cuisines: ["North Indian", "South Indian"],
  spice_level: "medium",
  weekday_cooking_time_minutes: 30,
  weekend_cooking_time_minutes: 60,
  meals_to_plan: ["breakfast", "lunch", "dinner"],
  variety_gap_days: 7,
  allow_leftovers: true,
  budget_preference: "medium",
};

function membershipContext(
  permissions: Partial<MembershipContext["permissions"]> = {},
): MembershipContext {
  return {
    householdId: "h1",
    userId: "u1",
    role: "owner",
    membershipType: "permanent",
    expiresAt: null,
    permissions: {
      can_view_plan: true,
      can_suggest_meals: true,
      can_change_today_menu: true,
      can_change_weekly_schedule: true,
      can_manage_grocery_list: true,
      can_invite_members: true,
      can_remove_members: true,
      can_edit_household_preferences: true,
      ...permissions,
    },
  };
}

describe("toPreferencesDto", () => {
  it("maps every snake_case column to its camelCase field", () => {
    expect(toPreferencesDto(PREFERENCES_ROW)).toEqual({
      familySize: 4,
      adultsCount: 2,
      kidsCount: 2,
      dietType: "vegetarian",
      preferredCuisines: ["North Indian", "South Indian"],
      spiceLevel: "medium",
      weekdayCookingTimeMinutes: 30,
      weekendCookingTimeMinutes: 60,
      mealsToPlan: ["breakfast", "lunch", "dinner"],
      varietyGapDays: 7,
      allowLeftovers: true,
      budgetPreference: "medium",
    });
  });

  it("preserves null cooking-time values", () => {
    const dto = toPreferencesDto({
      ...PREFERENCES_ROW,
      weekday_cooking_time_minutes: null,
      weekend_cooking_time_minutes: null,
    });
    expect(dto.weekdayCookingTimeMinutes).toBeNull();
    expect(dto.weekendCookingTimeMinutes).toBeNull();
  });
});

describe("toCanFlagsDto", () => {
  it("translates the eight flags to camelCase, preserving values", () => {
    const ctx = membershipContext({ can_change_today_menu: false });
    expect(toCanFlagsDto(ctx.permissions)).toEqual({
      canViewPlan: true,
      canSuggestMeals: true,
      canChangeTodayMenu: false,
      canChangeWeeklySchedule: true,
      canManageGroceryList: true,
      canInviteMembers: true,
      canRemoveMembers: true,
      canEditHouseholdPreferences: true,
    });
  });
});

describe("toCurrentUserPermissionsDto", () => {
  it("includes role + membershipType alongside the flags", () => {
    const dto = toCurrentUserPermissionsDto(
      membershipContext({ can_invite_members: false }),
    );
    expect(dto.role).toBe("owner");
    expect(dto.membershipType).toBe("permanent");
    expect(dto.canInviteMembers).toBe(false);
    expect(dto.canViewPlan).toBe(true);
  });
});
