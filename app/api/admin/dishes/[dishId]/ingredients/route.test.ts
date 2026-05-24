import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/admin", () => ({
  listDishIngredients: vi.fn(),
  addDishIngredient: vi.fn(),
}));

import { addDishIngredient, listDishIngredients } from "@/lib/services/admin";

import { GET, POST } from "./route";

const DISH_ID = "11111111-1111-1111-1111-111111111111";

function ctx() {
  return { params: Promise.resolve({ dishId: DISH_ID }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dish ingredients collection", () => {
  it("GET wraps the bounded envelope", async () => {
    vi.mocked(listDishIngredients).mockResolvedValue([{ id: "di1" } as never]);
    const res = await GET(new Request("http://test.local"), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).page.hasMore).toBe(false);
    expect(listDishIngredients).toHaveBeenCalledWith(DISH_ID);
  });

  it("POST adds and returns 201", async () => {
    vi.mocked(addDishIngredient).mockResolvedValue({ id: "di2" } as never);
    const res = await POST(
      new Request("http://test.local", {
        method: "POST",
        body: JSON.stringify({
          ingredientId: "22222222-2222-2222-2222-222222222222",
          quantityPerServing: 1,
          unit: "cup",
        }),
      }),
      ctx(),
    );
    expect(res.status).toBe(201);
  });
});
