import { describe, expect, it } from "vitest";

import { toMealPlanDto, toMealPlanItemDto, type MealPlanItemRow } from "./dto";

const ROW: MealPlanItemRow = {
  id: "i1",
  meal_plan_id: "p1",
  date: "2026-05-25",
  meal_slot: "dinner",
  dish_id: "d1",
  status: "suggested",
  locked: false,
  reason: "Vegetarian, fits your window.",
  changed_by_user_id: null,
  dishes: { name: "Palak Paneer" },
};

describe("toMealPlanItemDto", () => {
  it("maps a row with a joined dish name", () => {
    expect(toMealPlanItemDto(ROW)).toEqual({
      mealPlanItemId: "i1",
      mealPlanId: "p1",
      date: "2026-05-25",
      mealSlot: "dinner",
      dishId: "d1",
      dishName: "Palak Paneer",
      status: "suggested",
      locked: false,
      reason: "Vegetarian, fits your window.",
      changedByUserId: null,
      pairedDishes: [],
    });
  });

  it("falls back to null when no dish is joined", () => {
    expect(toMealPlanItemDto({ ...ROW, dishes: null }).dishName).toBeNull();
  });

  it("uses an explicit dishName override when provided", () => {
    expect(
      toMealPlanItemDto({ ...ROW, dishes: null }, "Rajma Chawal").dishName,
    ).toBe("Rajma Chawal");
  });

  it("maps an eating-out cell (null dish)", () => {
    const dto = toMealPlanItemDto({
      ...ROW,
      dish_id: null,
      status: "eating_out",
      dishes: null,
    });
    expect(dto.dishId).toBeNull();
    expect(dto.status).toBe("eating_out");
    expect(dto.dishName).toBeNull();
  });
});

describe("toMealPlanDto", () => {
  it("maps a meal_plans row to camelCase", () => {
    expect(
      toMealPlanDto({
        id: "p1",
        status: "active",
        start_date: "2026-05-25",
        end_date: "2026-05-31",
      }),
    ).toEqual({
      mealPlanId: "p1",
      status: "active",
      startDate: "2026-05-25",
      endDate: "2026-05-31",
    });
  });
});
