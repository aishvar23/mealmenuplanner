import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAdmin } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/db/service-role";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/service-role", () => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn() }));

import {
  createIngredient,
  deleteIngredient,
  listIngredients,
  updateIngredient,
} from "@/lib/services/admin/ingredients";

import { createSupabaseStub, type QueryPlan } from "./supabase-stub";

const INGREDIENT_ID = "11111111-1111-1111-1111-111111111111";

function ingredientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INGREDIENT_ID,
    name: "Spinach",
    category: "vegetables",
    default_unit: "g",
    common_names: ["Palak"],
    allergen_type: null,
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

describe("listIngredients", () => {
  it("returns mapped ingredients", async () => {
    useStub({ ingredients: { data: [ingredientRow()], error: null } });
    const list = await listIngredients({ search: "spin" });
    expect(list[0]?.defaultUnit).toBe("g");
  });
});

describe("createIngredient", () => {
  it("returns the created ingredient", async () => {
    useStub({ ingredients: { data: ingredientRow(), error: null } });
    const created = await createIngredient({
      name: "Spinach",
      category: "vegetables",
      defaultUnit: "g",
    });
    expect(created.name).toBe("Spinach");
  });

  it("maps a duplicate-name unique violation to ConflictError", async () => {
    useStub({ ingredients: { data: null, error: { code: "23505" } } });
    await expect(
      createIngredient({ name: "Spinach", category: "v", defaultUnit: "g" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects an incomplete body", async () => {
    await expect(createIngredient({ name: "Spinach" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("updateIngredient", () => {
  it("404s when the ingredient is absent", async () => {
    useStub({ ingredients: { data: null, error: null } });
    await expect(
      updateIngredient(INGREDIENT_ID, { category: "spices" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("deleteIngredient", () => {
  it("maps an in-use FK violation to ConflictError", async () => {
    useStub({ ingredients: { data: null, error: { code: "23503" } } });
    await expect(deleteIngredient(INGREDIENT_ID)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("returns the deleted id", async () => {
    useStub({ ingredients: { data: { id: INGREDIENT_ID }, error: null } });
    expect(await deleteIngredient(INGREDIENT_ID)).toEqual({
      id: INGREDIENT_ID,
      deleted: true,
    });
  });
});
