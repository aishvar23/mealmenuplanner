import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotFoundError } from "@/lib/errors";

// Mock the `household` service so the test exercises only the boundary wiring
// (param resolution → service call → envelope/status).
vi.mock("@/lib/services/household", () => ({ getHousehold: vi.fn() }));

import { getHousehold } from "@/lib/services/household";

import { GET } from "./route";

const HOUSEHOLD_ID = "22222222-2222-2222-2222-222222222222";

function getRequest(): Request {
  return new Request(`http://test.local/api/households/${HOUSEHOLD_ID}`);
}

function routeContext(householdId: string) {
  return { params: Promise.resolve({ householdId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/households/{householdId}", () => {
  it("returns 200 with the household DTO from the service", async () => {
    const dto = {
      id: HOUSEHOLD_ID,
      name: "Suhane Household",
      createdByUserId: "u1",
      preferences: null,
      currentUserPermissions: {
        role: "owner" as const,
        membershipType: "permanent" as const,
        canViewPlan: true,
        canSuggestMeals: true,
        canChangeTodayMenu: true,
        canChangeWeeklySchedule: true,
        canManageGroceryList: true,
        canInviteMembers: true,
        canRemoveMembers: true,
        canEditHouseholdPreferences: true,
      },
    };
    vi.mocked(getHousehold).mockResolvedValue(dto);

    const res = await GET(getRequest(), routeContext(HOUSEHOLD_ID));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(dto);
    expect(getHousehold).toHaveBeenCalledWith(HOUSEHOLD_ID);
  });

  it("maps a service NotFoundError to a 404 envelope", async () => {
    vi.mocked(getHousehold).mockRejectedValue(new NotFoundError());

    const res = await GET(getRequest(), routeContext(HOUSEHOLD_ID));

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });
});
