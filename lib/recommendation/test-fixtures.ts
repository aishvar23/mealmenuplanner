/**
 * Fixture factories for the recommendation engine tests (design/05 § 11 — "a
 * small library of fixture households and fixture dishes"). Not a test file (no
 * `.test` suffix, no `vitest` import), so it is never collected as a suite, and
 * not imported by anything in `app/`, so it never reaches the bundle.
 */

import type {
  CandidateDish,
  CandidateIngredient,
  HouseholdContext,
  MealHistory,
  MemberContext,
} from "./types";

export function makeHousehold(
  overrides: Partial<HouseholdContext> = {},
): HouseholdContext {
  return {
    dietTypes: ["vegetarian"],
    preferredCuisines: ["North Indian"],
    weekdayCookingTimeMinutes: 45,
    weekendCookingTimeMinutes: 90,
    varietyGapDays: 7,
    kidsCount: 0,
    dishFrequencies: new Map(),
    dishSuitableSlots: new Map(),
    chosenDishIds: new Set(),
    ...overrides,
  };
}

export function makeMember(
  overrides: Partial<MemberContext> = {},
): MemberContext {
  return {
    dietType: null,
    allergies: [],
    dislikedIngredients: [],
    likedDishes: [],
    dislikedDishes: [],
    ...overrides,
  };
}

export function makeIngredient(
  overrides: Partial<CandidateIngredient> = {},
): CandidateIngredient {
  return {
    ingredientId: "ing-rice",
    name: "rice",
    category: "grains",
    commonNames: [],
    allergenType: null,
    imageUrl: null,
    imageAltText: null,
    imageStatus: "placeholder",
    quantityPerServing: 1,
    isRequired: true,
    isOptional: false,
    ...overrides,
  };
}

export function makeDish(
  overrides: Partial<CandidateDish> = {},
): CandidateDish {
  return {
    id: "dish-1",
    name: "Dal Tadka",
    dietType: "vegetarian",
    cuisine: "North Indian",
    mealSlots: ["lunch", "dinner"],
    mealRole: "main_component",
    totalTimeMinutes: 30,
    popularityCount: 0,
    difficulty: "easy",
    kidFriendly: false,
    lunchboxFriendly: false,
    imageUrl: null,
    imageAltText: null,
    imageStatus: "placeholder",
    ingredients: [makeIngredient()],
    prepTasks: [],
    pairings: [],
    ...overrides,
  };
}

export function emptyHistory(
  overrides: Partial<MealHistory> = {},
): MealHistory {
  return {
    recentlyCookedDishIds: new Set<string>(),
    recentlyRejectedDishIds: new Set<string>(),
    doNotSuggestAgainDishIds: new Set<string>(),
    ...overrides,
  };
}
