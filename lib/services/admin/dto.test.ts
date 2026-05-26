import { describe, expect, it } from "vitest";

import {
  toDishDto,
  toDishIngredientDto,
  toIngredientDto,
  toPairingDto,
  toPrepTaskDto,
} from "@/lib/services/admin/dto";
import type { Database } from "@/lib/db/database.types";

type DishRow = Database["public"]["Tables"]["dishes"]["Row"];

const DISH_ROW: DishRow = {
  id: "d1",
  name: "Rajma Chawal",
  description: "Kidney bean curry with rice",
  cuisine: "North Indian",
  region: "Punjab",
  meal_slots: ["lunch", "dinner"],
  meal_role: "main_component",
  diet_type: "vegetarian",
  prep_time_minutes: 20,
  cook_time_minutes: 40,
  total_time_minutes: 60,
  difficulty: "medium",
  spice_level: "medium",
  kid_friendly: true,
  lunchbox_friendly: false,
  leftover_friendly: true,
  batch_cook_friendly: true,
  diabetic_friendly: false,
  low_sodium: false,
  high_protein: true,
  low_carb: false,
  image_url: null,
  image_alt_text: null,
  image_status: "placeholder",
  image_verified: false,
  popularity_count: 0,
  status: "draft",
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-02T00:00:00Z",
};

describe("toDishDto", () => {
  it("maps every column to its camelCase key", () => {
    const dto = toDishDto(DISH_ROW);
    expect(dto).toMatchObject({
      id: "d1",
      name: "Rajma Chawal",
      mealSlots: ["lunch", "dinner"],
      dietType: "vegetarian",
      prepTimeMinutes: 20,
      cookTimeMinutes: 40,
      totalTimeMinutes: 60,
      kidFriendly: true,
      highProtein: true,
      imageUrl: null,
      imageAltText: null,
      imageStatus: "placeholder",
      imageVerified: false,
      status: "draft",
    });
  });
});

describe("toIngredientDto", () => {
  it("maps an ingredient row", () => {
    const dto = toIngredientDto({
      id: "i1",
      name: "Spinach",
      category: "vegetables",
      default_unit: "g",
      common_names: ["Palak"],
      allergen_type: null,
      image_url: null,
      image_alt_text: null,
      image_status: "placeholder",
      image_verified: false,
      created_at: "t",
      updated_at: "t",
    });
    expect(dto).toEqual({
      id: "i1",
      name: "Spinach",
      category: "vegetables",
      defaultUnit: "g",
      commonNames: ["Palak"],
      allergenType: null,
      imageUrl: null,
      imageAltText: null,
      imageStatus: "placeholder",
      imageVerified: false,
      createdAt: "t",
      updatedAt: "t",
    });
  });
});

describe("toDishIngredientDto", () => {
  it("merges the resolved ingredient name", () => {
    const dto = toDishIngredientDto(
      {
        id: "di1",
        dish_id: "d1",
        ingredient_id: "i1",
        quantity_per_serving: 0.5,
        unit: "cup",
        is_required: true,
        is_optional: false,
        created_at: "t",
        updated_at: "t",
      },
      "Spinach",
    );
    expect(dto).toEqual({
      id: "di1",
      ingredientId: "i1",
      ingredientName: "Spinach",
      quantityPerServing: 0.5,
      unit: "cup",
      isRequired: true,
      isOptional: false,
    });
  });
});

describe("toPrepTaskDto", () => {
  it("maps a prep task row", () => {
    expect(
      toPrepTaskDto({
        id: "p1",
        dish_id: "d1",
        task_name: "Soak chickpeas",
        required_before_minutes: 480,
        description: "Soak overnight",
        created_at: "t",
        updated_at: "t",
      }),
    ).toEqual({
      id: "p1",
      taskName: "Soak chickpeas",
      requiredBeforeMinutes: 480,
      description: "Soak overnight",
    });
  });
});

describe("toPairingDto", () => {
  it("merges the resolved paired-dish name", () => {
    expect(
      toPairingDto(
        {
          id: "pr1",
          primary_dish_id: "d1",
          paired_dish_id: "d2",
          pairing_type: "rice_pairing",
          created_at: "t",
          updated_at: "t",
        },
        "Jeera Rice",
      ),
    ).toEqual({
      id: "pr1",
      pairedDishId: "d2",
      pairedDishName: "Jeera Rice",
      pairingType: "rice_pairing",
    });
  });
});
