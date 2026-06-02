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
  eating_out_note: null,
  changed_by_user_id: null,
  dishes: {
    name: "Palak Paneer",
    image_url: null,
    image_alt_text: null,
    image_status: "placeholder",
    serving_qty: 1,
    serving_unit: "bowl",
    calories_kcal: 320,
    protein_g: 14,
    carbs_g: 12,
    fat_g: 22,
    glycemic_index: 30,
  },
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
      dishImageUrl: null,
      dishImageAltText: null,
      dishImageStatus: "placeholder",
      status: "suggested",
      locked: false,
      reason: "Vegetarian, fits your window.",
      nutrition: {
        servingQty: 1,
        servingUnit: "bowl",
        calories: 320,
        proteinG: 14,
        carbsG: 12,
        fatG: 22,
        glycemicIndex: 30,
      },
      eatingOutNote: null,
      changedByUserId: null,
      pairedDishes: [],
    });
  });

  it("falls back to null when no dish is joined", () => {
    expect(toMealPlanItemDto({ ...ROW, dishes: null }).dishName).toBeNull();
  });

  it("uses an explicit dishName override when provided", () => {
    expect(
      toMealPlanItemDto({ ...ROW, dishes: null }, "Rajma Chawal", {
        imageUrl: "/rajma.jpg",
        imageAltText: "Rajma Chawal",
        imageStatus: "verified",
      }).dishName,
    ).toBe("Rajma Chawal");
  });

  it("uses an explicit dish image override when provided", () => {
    const dto = toMealPlanItemDto({ ...ROW, dishes: null }, "Rajma Chawal", {
      imageUrl: "/rajma.jpg",
      imageAltText: "Rajma Chawal in a bowl",
      imageStatus: "verified",
    });
    expect(dto.dishImageUrl).toBe("/rajma.jpg");
    expect(dto.dishImageAltText).toBe("Rajma Chawal in a bowl");
    expect(dto.dishImageStatus).toBe("verified");
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
    expect(dto.dishImageStatus).toBeNull();
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
