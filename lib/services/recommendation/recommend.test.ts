import { beforeEach, describe, expect, it, vi } from "vitest";

import { getActiveMembership } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/db/server";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  emptyHistory,
  makeDish,
  makeHousehold,
} from "@/lib/recommendation/test-fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getActiveMembership: vi.fn() }));
vi.mock("@/lib/services/recommendation/load-inputs", () => ({
  loadHouseholdContext: vi.fn(),
  loadActiveMembers: vi.fn(),
  loadCandidateDishes: vi.fn(),
  loadMealHistory: vi.fn(),
  loadPopularCombinationDishIds: vi.fn(),
}));

import {
  loadActiveMembers,
  loadCandidateDishes,
  loadHouseholdContext,
  loadMealHistory,
  loadPopularCombinationDishIds,
} from "@/lib/services/recommendation/load-inputs";
import {
  loadSlotInputs,
  recommendForSlot,
} from "@/lib/services/recommendation/recommend";

const HOUSEHOLD_ID = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createServerSupabaseClient).mockResolvedValue({} as never);
  vi.mocked(getActiveMembership).mockResolvedValue({} as never);
  vi.mocked(loadHouseholdContext).mockResolvedValue(makeHousehold());
  vi.mocked(loadActiveMembers).mockResolvedValue([]);
  vi.mocked(loadCandidateDishes).mockResolvedValue([]);
  vi.mocked(loadMealHistory).mockResolvedValue(emptyHistory());
  vi.mocked(loadPopularCombinationDishIds).mockResolvedValue(new Set());
});

describe("recommendForSlot — request validation", () => {
  it("rejects a bad date before doing any I/O", async () => {
    await expect(
      recommendForSlot(HOUSEHOLD_ID, "not-a-date", "dinner"),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(getActiveMembership).not.toHaveBeenCalled();
  });

  it("rejects a bad meal slot", async () => {
    await expect(
      recommendForSlot(HOUSEHOLD_ID, "2026-05-25", "brunch"),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("loadSlotInputs — access gate", () => {
  it("404s a malformed household id without hitting the guard", async () => {
    await expect(
      loadSlotInputs("not-a-uuid", "2026-05-25", "dinner"),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(getActiveMembership).not.toHaveBeenCalled();
  });

  it("404s a non-member (existence-hiding)", async () => {
    vi.mocked(getActiveMembership).mockResolvedValue(null);
    await expect(
      loadSlotInputs(HOUSEHOLD_ID, "2026-05-25", "dinner"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws ValidationError when the household has no preferences yet", async () => {
    vi.mocked(loadHouseholdContext).mockResolvedValue(null);
    await expect(
      loadSlotInputs(HOUSEHOLD_ID, "2026-05-25", "dinner"),
    ).rejects.toBeInstanceOf(ValidationError);
    // Members/dishes/history are not loaded once preferences are missing.
    expect(loadCandidateDishes).not.toHaveBeenCalled();
  });

  it("assembles the inputs and passes the variety gap to the history loader", async () => {
    vi.mocked(loadHouseholdContext).mockResolvedValue(
      makeHousehold({ varietyGapDays: 10 }),
    );
    const inputs = await loadSlotInputs(HOUSEHOLD_ID, "2026-05-25", "lunch");
    expect(inputs.date).toBe("2026-05-25");
    expect(inputs.mealSlot).toBe("lunch");
    expect(loadMealHistory).toHaveBeenCalledWith(
      expect.anything(),
      HOUSEHOLD_ID,
      "2026-05-25",
      10,
    );
  });
});

describe("recommendForSlot — integration with the engine", () => {
  it("returns ranked recommendations from the loaded inputs", async () => {
    vi.mocked(loadCandidateDishes).mockResolvedValue([
      makeDish({ id: "dal", name: "Dal Tadka", totalTimeMinutes: 30 }),
      makeDish({ id: "paneer", name: "Paneer", totalTimeMinutes: 60 }),
    ]);

    const result = await recommendForSlot(
      HOUSEHOLD_ID,
      "2026-05-25",
      "dinner",
      {
        now: new Date("2026-05-25T09:00:00Z"),
      },
    );

    expect(result.map((r) => r.dishId)).toEqual(["dal", "paneer"]);
    expect(result[0]?.reason).toMatch(/^Suggested because /);
  });
});
