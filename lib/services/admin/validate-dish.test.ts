import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";
import {
  buildDishInsert,
  buildDishUpdate,
  parseDishListFilters,
} from "@/lib/services/admin/validate-dish";

describe("buildDishInsert", () => {
  it("translates a full valid body to snake_case", () => {
    const insert = buildDishInsert({
      name: "  Palak Paneer  ",
      dietType: "vegetarian",
      description: "Creamy spinach and paneer",
      cuisine: "North Indian",
      region: "Punjab",
      mealSlots: ["lunch", "dinner"],
      prepTimeMinutes: 15,
      cookTimeMinutes: 25,
      difficulty: "medium",
      spiceLevel: "medium",
      kidFriendly: true,
      highProtein: true,
      weightLoss: true,
    });

    expect(insert).toMatchObject({
      name: "Palak Paneer", // trimmed
      diet_type: "vegetarian",
      cuisine: "North Indian",
      meal_slots: ["lunch", "dinner"],
      prep_time_minutes: 15,
      cook_time_minutes: 25,
      kid_friendly: true,
      high_protein: true,
      weight_loss: true,
    });
  });

  it("requires name and dietType", () => {
    expect(() => buildDishInsert({})).toThrow(ValidationError);
    expect(() => buildDishInsert({ name: "X" })).toThrow(ValidationError);
    expect(() => buildDishInsert({ dietType: "vegan" })).toThrow(
      ValidationError,
    );
  });

  it("rejects an unknown dietType enum value", () => {
    expect(() => buildDishInsert({ name: "X", dietType: "carnivore" })).toThrow(
      ValidationError,
    );
  });

  it("rejects an invalid meal slot value", () => {
    expect(() =>
      buildDishInsert({
        name: "X",
        dietType: "vegan",
        mealSlots: ["brunch"],
      }),
    ).toThrow(ValidationError);
  });

  it("rejects a negative prep/cook time", () => {
    expect(() =>
      buildDishInsert({ name: "X", dietType: "vegan", prepTimeMinutes: -1 }),
    ).toThrow(ValidationError);
  });

  it("never writes status (activation is gated separately)", () => {
    const insert = buildDishInsert({
      name: "X",
      dietType: "vegan",
      status: "active",
    } as Record<string, unknown>);
    expect("status" in insert).toBe(false);
  });
});

describe("buildDishUpdate", () => {
  it("allows a partial update and clears nullable text with null", () => {
    const update = buildDishUpdate({ cuisine: null, region: "" });
    expect(update.cuisine).toBeNull();
    // An empty string for a nullable text field collapses to null.
    expect(update.region).toBeNull();
  });

  it("rejects an empty update", () => {
    expect(() => buildDishUpdate({})).toThrow(ValidationError);
  });

  it("ignores unknown keys", () => {
    const update = buildDishUpdate({ name: "New", bogus: 1 });
    expect(update).toEqual({ name: "New" });
  });
});

describe("parseDishListFilters", () => {
  it("reads recognized filters", () => {
    const params = new URLSearchParams({
      search: "  rajma ",
      cuisine: "North Indian",
      mealSlot: "dinner",
      dietType: "vegetarian",
      status: "active",
      missingMetadata: "true",
    });
    expect(parseDishListFilters(params)).toEqual({
      search: "rajma",
      cuisine: "North Indian",
      mealSlot: "dinner",
      dietType: "vegetarian",
      status: "active",
      missingMetadata: true,
    });
  });

  it("leniently drops unrecognized enum values rather than throwing", () => {
    const params = new URLSearchParams({
      mealSlot: "brunch",
      dietType: "carnivore",
      status: "live",
    });
    expect(parseDishListFilters(params)).toEqual({});
  });

  it("only enables missingMetadata for the literal 'true'", () => {
    expect(
      parseDishListFilters(new URLSearchParams({ missingMetadata: "1" })),
    ).toEqual({});
  });
});
