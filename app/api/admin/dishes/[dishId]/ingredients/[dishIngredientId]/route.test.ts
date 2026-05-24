import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/admin", () => ({
  updateDishIngredient: vi.fn(),
  removeDishIngredient: vi.fn(),
}));

import {
  removeDishIngredient,
  updateDishIngredient,
} from "@/lib/services/admin";

import { DELETE, PATCH } from "./route";

const DISH_ID = "11111111-1111-1111-1111-111111111111";
const LINK_ID = "33333333-3333-3333-3333-333333333333";

function ctx() {
  return {
    params: Promise.resolve({ dishId: DISH_ID, dishIngredientId: LINK_ID }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dish ingredient item", () => {
  it("PATCH updates and returns 200", async () => {
    vi.mocked(updateDishIngredient).mockResolvedValue({ id: LINK_ID } as never);
    const res = await PATCH(
      new Request("http://test.local", {
        method: "PATCH",
        body: JSON.stringify({ quantityPerServing: 2 }),
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(updateDishIngredient).toHaveBeenCalledWith(DISH_ID, LINK_ID, {
      quantityPerServing: 2,
    });
  });

  it("DELETE removes and returns 200", async () => {
    vi.mocked(removeDishIngredient).mockResolvedValue({
      id: LINK_ID,
      removed: true,
    });
    const res = await DELETE(new Request("http://test.local"), ctx());
    expect(res.status).toBe(200);
    expect(removeDishIngredient).toHaveBeenCalledWith(DISH_ID, LINK_ID);
  });
});
