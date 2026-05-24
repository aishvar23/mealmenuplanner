import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAdmin } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/db/service-role";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

// The dish service is server-only and runs on the admin (service-role) client
// behind the requireAdmin gate. Stub the marker + both dependencies.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/service-role", () => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn() }));

import {
  createDish,
  getDish,
  listDishes,
  setDishStatus,
  updateDish,
} from "@/lib/services/admin/dishes";

import { createSupabaseStub, type QueryPlan } from "./supabase-stub";

const DISH_ID = "11111111-1111-1111-1111-111111111111";

function dishRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DISH_ID,
    name: "Rajma Chawal",
    description: null,
    cuisine: "North Indian",
    region: null,
    meal_slots: ["lunch", "dinner"],
    diet_type: "vegetarian",
    prep_time_minutes: 20,
    cook_time_minutes: 40,
    total_time_minutes: 60,
    difficulty: "medium",
    spice_level: "medium",
    kid_friendly: true,
    lunchbox_friendly: false,
    leftover_friendly: false,
    batch_cook_friendly: false,
    diabetic_friendly: false,
    low_sodium: false,
    high_protein: false,
    low_carb: false,
    status: "draft",
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-02T00:00:00Z",
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

describe("listDishes", () => {
  it("returns mapped dishes and applies the requested filters", async () => {
    const stub = useStub({ dishes: { data: [dishRow()], error: null } });

    const dishes = await listDishes({
      search: "rajma",
      cuisine: "North Indian",
      mealSlot: "dinner",
      dietType: "vegetarian",
      status: "active",
      missingMetadata: true,
    });

    expect(dishes).toHaveLength(1);
    expect(dishes[0]?.name).toBe("Rajma Chawal");

    const methods = stub.calls.map((c) => c.method);
    expect(methods).toContain("ilike");
    expect(methods).toContain("contains");
    expect(methods).toContain("or"); // missingMetadata
    expect(
      stub.calls.some((c) => c.method === "eq" && c.args[0] === "status"),
    ).toBe(true);
  });

  it("propagates ForbiddenError from the admin guard", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new ForbiddenError());
    await expect(listDishes()).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("getDish", () => {
  it("assembles the dish with sub-resources and a quality checklist", async () => {
    useStub({
      // First "dishes" hit = the dish row (maybeSingle). No pairings → the
      // paired-name lookup never runs, so a single entry suffices.
      dishes: { data: dishRow(), error: null },
      dish_ingredients: {
        data: [
          {
            id: "di1",
            dish_id: DISH_ID,
            ingredient_id: "22222222-2222-2222-2222-222222222222",
            quantity_per_serving: 1,
            unit: "cup",
            is_required: true,
            is_optional: false,
            created_at: "t",
            updated_at: "t",
          },
        ],
        error: null,
      },
      ingredients: {
        data: [{ id: "22222222-2222-2222-2222-222222222222", name: "Rajma" }],
        error: null,
      },
      dish_prep_tasks: { data: [], error: null },
      dish_pairings: { data: [], error: null },
    });

    const detail = await getDish(DISH_ID);

    expect(detail.name).toBe("Rajma Chawal");
    expect(detail.ingredients).toHaveLength(1);
    expect(detail.ingredients[0]?.ingredientName).toBe("Rajma");
    expect(detail.qualityChecklist.canActivate).toBe(true);
  });

  it("404s a malformed id without gating or querying", async () => {
    await expect(getDish("not-a-uuid")).rejects.toBeInstanceOf(NotFoundError);
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it("404s when the dish does not exist", async () => {
    useStub({ dishes: { data: null, error: null } });
    await expect(getDish(DISH_ID)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("createDish", () => {
  it("inserts and returns the created dish", async () => {
    useStub({ dishes: { data: dishRow(), error: null } });
    const dish = await createDish({
      name: "Rajma Chawal",
      dietType: "vegetarian",
    });
    expect(dish.id).toBe(DISH_ID);
  });

  it("rejects an invalid body before touching the DB", async () => {
    await expect(createDish({})).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("updateDish", () => {
  it("404s when the dish row is absent", async () => {
    useStub({ dishes: { data: null, error: null } });
    await expect(updateDish(DISH_ID, { name: "New" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("setDishStatus", () => {
  it("activates a dish that passes the checklist", async () => {
    useStub({
      // getDish: dish row; then setDishStatus update returns the active row.
      dishes: [
        { data: dishRow(), error: null },
        { data: dishRow({ status: "active" }), error: null },
      ],
      dish_ingredients: {
        data: [
          {
            id: "di1",
            dish_id: DISH_ID,
            ingredient_id: "22222222-2222-2222-2222-222222222222",
            quantity_per_serving: 1,
            unit: "cup",
            is_required: true,
            is_optional: false,
            created_at: "t",
            updated_at: "t",
          },
        ],
        error: null,
      },
      ingredients: {
        data: [{ id: "22222222-2222-2222-2222-222222222222", name: "Rajma" }],
        error: null,
      },
      dish_prep_tasks: { data: [], error: null },
      dish_pairings: { data: [], error: null },
    });

    const detail = await setDishStatus(DISH_ID, "active");
    expect(detail.status).toBe("active");
  });

  it("refuses to activate a dish that fails the checklist", async () => {
    useStub({
      // Dish missing cuisine + ingredients → checklist fails.
      dishes: { data: dishRow({ cuisine: null }), error: null },
      dish_ingredients: { data: [], error: null },
      dish_prep_tasks: { data: [], error: null },
      dish_pairings: { data: [], error: null },
    });

    await expect(setDishStatus(DISH_ID, "active")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("archives without running the checklist", async () => {
    useStub({
      dishes: [
        { data: dishRow({ status: "active" }), error: null },
        { data: dishRow({ status: "archived" }), error: null },
      ],
      dish_ingredients: { data: [], error: null },
      dish_prep_tasks: { data: [], error: null },
      dish_pairings: { data: [], error: null },
    });

    const detail = await setDishStatus(DISH_ID, "archived");
    expect(detail.status).toBe("archived");
  });
});
