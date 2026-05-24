import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotFoundError } from "@/lib/errors";

// Mock the `household` service so the test exercises only the boundary wiring
// (param resolution → service call → envelope/status).
vi.mock("@/lib/services/household", () => ({ listMembers: vi.fn() }));

import { listMembers } from "@/lib/services/household";

import { GET } from "./route";

const HOUSEHOLD_ID = "22222222-2222-2222-2222-222222222222";

function getRequest(): Request {
  return new Request(
    `http://test.local/api/households/${HOUSEHOLD_ID}/members`,
  );
}

function routeContext(householdId: string) {
  return { params: Promise.resolve({ householdId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/households/{householdId}/members", () => {
  it("returns 200 with the member collection from the service", async () => {
    const collection = {
      data: [
        {
          memberId: "m1",
          userId: "u1",
          displayName: "Aishvarya",
          role: "owner" as const,
          membershipType: "permanent" as const,
          status: "active" as const,
          expiresAt: null,
          joinedAt: "2026-04-01T09:00:00Z",
          permissions: {
            canViewPlan: true,
            canSuggestMeals: true,
            canChangeTodayMenu: true,
            canChangeWeeklySchedule: true,
            canManageGroceryList: true,
            canInviteMembers: true,
            canRemoveMembers: true,
            canEditHouseholdPreferences: true,
          },
        },
      ],
      page: { nextCursor: null, hasMore: false },
    };
    vi.mocked(listMembers).mockResolvedValue(collection);

    const res = await GET(getRequest(), routeContext(HOUSEHOLD_ID));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(collection);
    expect(listMembers).toHaveBeenCalledWith(HOUSEHOLD_ID);
  });

  it("maps a service NotFoundError to a 404 envelope", async () => {
    vi.mocked(listMembers).mockRejectedValue(new NotFoundError());

    const res = await GET(getRequest(), routeContext(HOUSEHOLD_ID));

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });
});
