import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAdmin } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/db/service-role";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/service-role", () => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn() }));

import {
  addDishIngredient,
  listDishIngredients,
  removeDishIngredient,
} from "@/lib/services/admin/dish-ingredients";

import { createSupabaseStub, type QueryPlan } from "./supabase-stub";

const DISH_ID = "11111111-1111-1111-1111-111111111111";
const ING_ID = "22222222-2222-2222-2222-222222222222";
const LINK_ID = "33333333-3333-3333-3333-333333333333";

function linkRow(overrides: Record<string, unknown> = {}) {
  return {
    id: LINK_ID,
    dish_id: DISH_ID,
    ingredient_id: ING_ID,
    quantity_per_serving: 1,
    unit: "cup",
    is_required: true,
    is_optional: false,
    created_at: "t",
    updated_at: "t",
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

describe("listDishIngredients", () => {
  it("resolves ingredient names alongside the links", async () => {
    useStub({
      dish_ingredients: { data: [linkRow()], error: null },
      ingredients: { data: [{ id: ING_ID, name: "Rajma" }], error: null },
    });
    const links = await listDishIngredients(DISH_ID);
    expect(links[0]?.ingredientName).toBe("Rajma");
  });

  it("404s a malformed dish id", async () => {
    await expect(listDishIngredients("nope")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("addDishIngredient", () => {
  it("adds the link and returns it with the ingredient name", async () => {
    useStub({
      // assertDishExists, then the insert (both hit "dishes"/"dish_ingredients").
      dishes: { data: { id: DISH_ID }, error: null },
      dish_ingredients: { data: linkRow(), error: null },
      ingredients: { data: [{ id: ING_ID, name: "Rajma" }], error: null },
    });
    const link = await addDishIngredient(DISH_ID, {
      ingredientId: ING_ID,
      quantityPerServing: 1,
      unit: "cup",
    });
    expect(link.ingredientName).toBe("Rajma");
  });

  it("maps a duplicate link (unique violation) to ConflictError", async () => {
    useStub({
      dishes: { data: { id: DISH_ID }, error: null },
      dish_ingredients: { data: null, error: { code: "23505" } },
    });
    await expect(
      addDishIngredient(DISH_ID, {
        ingredientId: ING_ID,
        quantityPerServing: 1,
        unit: "cup",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("maps a bad ingredient FK to ValidationError", async () => {
    useStub({
      dishes: { data: { id: DISH_ID }, error: null },
      dish_ingredients: { data: null, error: { code: "23503" } },
    });
    await expect(
      addDishIngredient(DISH_ID, {
        ingredientId: ING_ID,
        quantityPerServing: 1,
        unit: "cup",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("404s when the parent dish is missing", async () => {
    useStub({ dishes: { data: null, error: null } });
    await expect(
      addDishIngredient(DISH_ID, {
        ingredientId: ING_ID,
        quantityPerServing: 1,
        unit: "cup",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("removeDishIngredient", () => {
  it("404s when the link is absent", async () => {
    useStub({ dish_ingredients: { data: null, error: null } });
    await expect(removeDishIngredient(DISH_ID, LINK_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("returns the removed id", async () => {
    useStub({ dish_ingredients: { data: { id: LINK_ID }, error: null } });
    expect(await removeDishIngredient(DISH_ID, LINK_ID)).toEqual({
      id: LINK_ID,
      removed: true,
    });
  });
});
