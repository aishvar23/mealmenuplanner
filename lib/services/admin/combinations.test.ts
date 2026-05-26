import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAdmin } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/db/service-role";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

// The combinations service is server-only and runs on the admin (service-role)
// client behind the requireAdmin gate. Stub the marker + both dependencies.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/service-role", () => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn() }));

import {
  approveCombination,
  listCombinations,
  rejectCombination,
  setCombinationStatus,
} from "@/lib/services/admin/combinations";

import { createSupabaseStub, type QueryPlan } from "./supabase-stub";

const COMBO_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";
const HOUSEHOLD_ID = "33333333-3333-3333-3333-333333333333";
const DISH_A = "44444444-4444-4444-4444-444444444444";
const DISH_B = "55555555-5555-5555-5555-555555555555";

function comboRow(overrides: Record<string, unknown> = {}) {
  return {
    id: COMBO_ID,
    name: "Rajma Masala plate",
    description: null,
    cuisine: "North Indian",
    region: null,
    diet_type: "vegetarian",
    status: "proposed",
    popularity_count: 0,
    source: "user_proposed",
    proposed_by_user_id: USER_ID,
    proposed_by_household_id: HOUSEHOLD_ID,
    created_at: "2026-05-20T00:00:00Z",
    ...overrides,
  };
}

function useStub(plan: QueryPlan) {
  const stub = createSupabaseStub(plan);
  vi.mocked(createServiceRoleClient).mockReturnValue(stub.client as never);
  return stub;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue({ id: "admin" } as never);
});

describe("listCombinations", () => {
  it("hydrates combos with items (sorted), dish names, and proposer/household names", async () => {
    const stub = useStub({
      meal_combinations: { data: [comboRow()], error: null },
      meal_combination_items: {
        data: [
          {
            combination_id: COMBO_ID,
            dish_id: DISH_B,
            role_in_combo: "rice",
            sort_order: 1,
          },
          {
            combination_id: COMBO_ID,
            dish_id: DISH_A,
            role_in_combo: "dal",
            sort_order: 0,
          },
        ],
        error: null,
      },
      dishes: {
        data: [
          { id: DISH_A, name: "Rajma Masala" },
          { id: DISH_B, name: "Jeera Rice" },
        ],
        error: null,
      },
      users: { data: [{ id: USER_ID, display_name: "Asha" }], error: null },
      households: {
        data: [{ id: HOUSEHOLD_ID, name: "Suhane Household" }],
        error: null,
      },
    });

    const combos = await listCombinations("proposed");

    expect(combos).toHaveLength(1);
    const combo = combos[0]!;
    expect(combo.proposedByUserName).toBe("Asha");
    expect(combo.proposedByHouseholdName).toBe("Suhane Household");
    // Items rendered in sort_order, with dish names resolved.
    expect(combo.items.map((i) => i.dishName)).toEqual([
      "Rajma Masala",
      "Jeera Rice",
    ]);
    expect(combo.items.map((i) => i.roleInCombo)).toEqual(["dal", "rice"]);
    // Default status filters to proposed, ordered oldest-first (created_at asc).
    expect(
      stub.calls.some(
        (c) =>
          c.method === "order" &&
          c.args[0] === "created_at" &&
          (c.args[1] as { ascending?: boolean })?.ascending === true,
      ),
    ).toBe(true);
  });

  it("orders active combos by popularity, not creation date", async () => {
    const stub = useStub({
      meal_combinations: { data: [], error: null },
    });
    await listCombinations("active");
    expect(
      stub.calls.some(
        (c) => c.method === "order" && c.args[0] === "popularity_count",
      ),
    ).toBe(true);
  });

  it("returns an empty list without follow-up lookups when no combos match", async () => {
    const stub = useStub({ meal_combinations: { data: [], error: null } });
    expect(await listCombinations("proposed")).toEqual([]);
    expect(stub.calls.some((c) => c.table === "meal_combination_items")).toBe(
      false,
    );
  });

  it("propagates ForbiddenError from the admin guard", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new ForbiddenError());
    await expect(listCombinations()).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("approveCombination / rejectCombination", () => {
  it("approves a combination → active and returns the refreshed DTO", async () => {
    const stub = useStub({
      // The update's maybeSingle returns the active row; empty items skip lookups.
      meal_combinations: { data: comboRow({ status: "active" }), error: null },
      meal_combination_items: { data: [], error: null },
    });

    const combo = await approveCombination(COMBO_ID);

    expect(combo.status).toBe("active");
    const update = stub.calls.find((c) => c.method === "update")
      ?.args[0] as Record<string, unknown>;
    expect(update.status).toBe("active");
  });

  it("rejects a combination → rejected", async () => {
    const stub = useStub({
      meal_combinations: {
        data: comboRow({ status: "rejected" }),
        error: null,
      },
      meal_combination_items: { data: [], error: null },
    });

    const combo = await rejectCombination(COMBO_ID);

    expect(combo.status).toBe("rejected");
    const update = stub.calls.find((c) => c.method === "update")
      ?.args[0] as Record<string, unknown>;
    expect(update.status).toBe("rejected");
  });

  it("404s a malformed id without gating or querying", async () => {
    await expect(
      setCombinationStatus("not-a-uuid", "active"),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it("404s when the combination row is absent", async () => {
    useStub({ meal_combinations: { data: null, error: null } });
    await expect(approveCombination(COMBO_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
