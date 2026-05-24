import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireAuthUser: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));

import { requireAuthUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { createSupabaseStub } from "@/lib/services/recommendation/query-stub";

import { resolveCurrentHousehold } from "./current-household";

function memberRow(overrides: Record<string, unknown> = {}) {
  return {
    household_id: "hh-1",
    role: "owner",
    membership_type: "permanent",
    status: "active",
    expires_at: null,
    joined_at: "2026-05-01T00:00:00Z",
    can_view_plan: true,
    can_suggest_meals: true,
    can_change_today_menu: true,
    can_change_weekly_schedule: true,
    can_manage_grocery_list: true,
    can_invite_members: true,
    can_remove_members: true,
    can_edit_household_preferences: true,
    households: { name: "Suhane Household" },
    ...overrides,
  };
}

function withMemberships(rows: unknown[]) {
  const stub = createSupabaseStub({
    tables: { household_members: { data: rows, error: null } },
  });
  vi.mocked(createServerSupabaseClient).mockResolvedValue(stub.client as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuthUser).mockResolvedValue({ id: "user-1" } as never);
});

describe("resolveCurrentHousehold", () => {
  it("returns null when the caller has no active membership", async () => {
    withMemberships([]);
    expect(await resolveCurrentHousehold()).toBeNull();
  });

  it("returns the household id, name, and permissions", async () => {
    withMemberships([memberRow()]);
    const result = await resolveCurrentHousehold();
    expect(result?.householdId).toBe("hh-1");
    expect(result?.name).toBe("Suhane Household");
    expect(result?.currentUserPermissions.canChangeWeeklySchedule).toBe(true);
    expect(result?.currentUserPermissions.role).toBe("owner");
  });

  it("skips an expired guest membership (real-time expiry backstop)", async () => {
    withMemberships([
      memberRow({
        role: "viewer",
        membership_type: "temporary_guest",
        expires_at: "2020-01-01T00:00:00Z",
      }),
    ]);
    expect(await resolveCurrentHousehold()).toBeNull();
  });
});
