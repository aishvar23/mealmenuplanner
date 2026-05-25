import { beforeEach, describe, expect, it, vi } from "vitest";

import { InternalError } from "@/lib/errors";

// The loaders are server-only but take the Supabase client as a parameter, so we
// only need to neutralize the `server-only` import marker; the stub client is
// passed in directly.
vi.mock("server-only", () => ({}));

import {
  loadActiveMembers,
  loadCandidateDishes,
  loadHouseholdContext,
  loadMealHistory,
} from "@/lib/services/recommendation/load-inputs";
import {
  createSupabaseStub,
  type StubPlan,
} from "@/lib/services/recommendation/query-stub";

const HOUSEHOLD_ID = "22222222-2222-2222-2222-222222222222";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function client(plan: StubPlan): any {
  return createSupabaseStub(plan).client;
}

beforeEach(() => vi.clearAllMocks());

describe("loadHouseholdContext", () => {
  it("maps the preferences row to a HouseholdContext", async () => {
    const supabase = client({
      tables: {
        household_preferences: {
          data: {
            diet_type: "vegetarian",
            preferred_cuisines: ["North Indian"],
            weekday_cooking_time_minutes: 45,
            weekend_cooking_time_minutes: 90,
            variety_gap_days: 7,
            kids_count: 2,
          },
          error: null,
        },
      },
    });
    expect(await loadHouseholdContext(supabase, HOUSEHOLD_ID)).toEqual({
      dietType: "vegetarian",
      preferredCuisines: ["North Indian"],
      weekdayCookingTimeMinutes: 45,
      weekendCookingTimeMinutes: 90,
      varietyGapDays: 7,
      kidsCount: 2,
    });
  });

  it("returns null when there is no preferences row", async () => {
    const supabase = client({
      tables: { household_preferences: { data: null, error: null } },
    });
    expect(await loadHouseholdContext(supabase, HOUSEHOLD_ID)).toBeNull();
  });

  it("throws InternalError on a query error", async () => {
    const supabase = client({
      tables: {
        household_preferences: { data: null, error: { message: "boom" } },
      },
    });
    await expect(
      loadHouseholdContext(supabase, HOUSEHOLD_ID),
    ).rejects.toBeInstanceOf(InternalError);
  });
});

describe("loadActiveMembers", () => {
  it("maps RPC rows to MemberContext and ignores the spice/health fields", async () => {
    const supabase = client({
      rpcs: {
        list_household_food_preferences: {
          data: [
            {
              user_id: "u1",
              diet_type: "vegan",
              allergies: ["peanut"],
              disliked_ingredients: ["brinjal"],
              liked_dishes: ["Dal"],
              disliked_dishes: ["Karela"],
              spice_preference: "mild",
              health_preference_tags: ["low_sugar"],
            },
          ],
          error: null,
        },
      },
    });
    expect(await loadActiveMembers(supabase, HOUSEHOLD_ID)).toEqual([
      {
        dietType: "vegan",
        allergies: ["peanut"],
        dislikedIngredients: ["brinjal"],
        likedDishes: ["Dal"],
        dislikedDishes: ["Karela"],
      },
    ]);
  });

  it("returns [] when the RPC returns null data", async () => {
    const supabase = client({
      rpcs: { list_household_food_preferences: { data: null, error: null } },
    });
    expect(await loadActiveMembers(supabase, HOUSEHOLD_ID)).toEqual([]);
  });
});

describe("loadCandidateDishes", () => {
  it("assembles dishes with their ingredients, prep tasks, and pairings", async () => {
    const supabase = client({
      tables: {
        dishes: {
          data: [
            {
              id: "dish-1",
              name: "Rajma",
              diet_type: "vegetarian",
              cuisine: "North Indian",
              meal_slots: ["lunch", "dinner"],
              meal_role: "main_component",
              total_time_minutes: 40,
              difficulty: "medium",
              kid_friendly: true,
              lunchbox_friendly: false,
            },
          ],
          error: null,
        },
        dish_ingredients: {
          data: [
            {
              dish_id: "dish-1",
              ingredient_id: "ing-rajma",
              quantity_per_serving: 2,
              is_required: true,
              is_optional: false,
            },
          ],
          error: null,
        },
        ingredients: {
          data: [
            {
              id: "ing-rajma",
              name: "kidney beans",
              category: "lentils",
              common_names: ["rajma"],
              allergen_type: null,
            },
          ],
          error: null,
        },
        dish_prep_tasks: {
          data: [
            {
              dish_id: "dish-1",
              task_name: "Soak rajma",
              required_before_minutes: 480,
              description: "overnight",
            },
          ],
          error: null,
        },
        dish_pairings: {
          data: [
            {
              primary_dish_id: "dish-1",
              paired_dish_id: "rice",
              pairing_type: "rice_pairing",
            },
          ],
          error: null,
        },
      },
    });

    const dishes = await loadCandidateDishes(supabase, "dinner");
    expect(dishes).toHaveLength(1);
    expect(dishes[0]).toMatchObject({
      id: "dish-1",
      name: "Rajma",
      dietType: "vegetarian",
      kidFriendly: true,
      ingredients: [
        {
          ingredientId: "ing-rajma",
          name: "kidney beans",
          category: "lentils",
          commonNames: ["rajma"],
          quantityPerServing: 2,
          isRequired: true,
        },
      ],
      prepTasks: [
        {
          taskName: "Soak rajma",
          requiredBeforeMinutes: 480,
          description: "overnight",
        },
      ],
      pairings: [{ dishId: "rice", pairingType: "rice_pairing" }],
    });
  });

  it("returns [] when no active dish matches the slot", async () => {
    const supabase = client({ tables: { dishes: { data: [], error: null } } });
    expect(await loadCandidateDishes(supabase, "dinner")).toEqual([]);
  });
});

describe("loadMealHistory", () => {
  it("aggregates recently-cooked, rejected, and do-not-suggest signals", async () => {
    const supabase = client({
      tables: {
        meal_plan_items: {
          data: [
            { dish_id: "cooked", status: "cooked" },
            { dish_id: "rejected", status: "rejected" },
            { dish_id: "replaced", status: "replaced" },
          ],
          error: null,
        },
        meal_feedback: {
          data: [
            {
              feedback_type: "do_not_suggest_again",
              meal_plan_items: { dish_id: "banned" },
            },
            {
              feedback_type: "kids_disliked",
              meal_plan_items: { dish_id: "kidshate" },
            },
            { feedback_type: "liked", meal_plan_items: { dish_id: "ignored" } },
            { feedback_type: "disliked", meal_plan_items: null },
          ],
          error: null,
        },
      },
    });

    const history = await loadMealHistory(
      supabase,
      HOUSEHOLD_ID,
      "2026-05-25",
      7,
    );
    expect([...history.recentlyCookedDishIds].sort()).toEqual([
      "cooked",
      "rejected",
      "replaced",
    ]);
    expect([...history.recentlyRejectedDishIds].sort()).toEqual([
      "kidshate",
      "rejected",
      "replaced",
    ]);
    expect([...history.doNotSuggestAgainDishIds]).toEqual(["banned"]);
  });
});
