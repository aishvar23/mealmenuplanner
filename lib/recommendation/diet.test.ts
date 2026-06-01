import { describe, expect, it } from "vitest";

import { RECOMMENDATION_CONFIG } from "@/lib/recommendation/config";
import {
  isDietCompatible,
  isDietCompatibleWithHousehold,
  strictestMemberDiet,
} from "@/lib/recommendation/diet";
import {
  makeDish,
  makeIngredient,
  makeMember,
} from "@/lib/recommendation/test-fixtures";
import type { DietType } from "@/lib/recommendation/types";

const config = RECOMMENDATION_CONFIG;

describe("strictestMemberDiet", () => {
  it("returns null when no member overrides the household", () => {
    expect(strictestMemberDiet([makeMember(), makeMember()])).toBeNull();
  });

  it("returns the strictest member override", () => {
    const members = [
      makeMember({ dietType: "non_vegetarian" }),
      makeMember({ dietType: "vegetarian" }),
    ];
    expect(strictestMemberDiet(members)).toBe("vegetarian");
  });

  it("ignores members with no diet override", () => {
    expect(strictestMemberDiet([makeMember({ dietType: null })])).toBeNull();
  });
});

describe("isDietCompatibleWithHousehold — multi-diet union", () => {
  const veg = makeDish({
    dietType: "vegetarian",
    ingredients: [makeIngredient()],
  });
  const chicken = makeDish({
    dietType: "non_vegetarian",
    ingredients: [makeIngredient()],
  });

  it("a single vegetarian diet excludes non-veg (unchanged behaviour)", () => {
    expect(
      isDietCompatibleWithHousehold(veg, ["vegetarian"], null, config),
    ).toBe(true);
    expect(
      isDietCompatibleWithHousehold(chicken, ["vegetarian"], null, config),
    ).toBe(false);
  });

  it("vegetarian + non-vegetarian accepts BOTH (the union)", () => {
    const diets: DietType[] = ["vegetarian", "non_vegetarian"];
    expect(isDietCompatibleWithHousehold(veg, diets, null, config)).toBe(true);
    expect(isDietCompatibleWithHousehold(chicken, diets, null, config)).toBe(
      true,
    );
  });

  it("a strict member narrows the union (vegan member drops non-veg)", () => {
    const diets: DietType[] = ["vegetarian", "non_vegetarian"];
    // A vegan member tightens: only vegan-safe dishes survive even in a
    // veg+non-veg household.
    expect(
      isDietCompatibleWithHousehold(chicken, diets, "vegetarian", config),
    ).toBe(false);
    expect(
      isDietCompatibleWithHousehold(veg, diets, "vegetarian", config),
    ).toBe(true);
  });

  it("a less-strict member never widens the household's diets", () => {
    // Household is vegetarian-only; a non-vegetarian member can't unlock meat.
    expect(
      isDietCompatibleWithHousehold(
        chicken,
        ["vegetarian"],
        "non_vegetarian",
        config,
      ),
    ).toBe(false);
  });
});

describe("isDietCompatible — diet-type matrix", () => {
  function check(effective: DietType, dishDiet: DietType): boolean {
    return isDietCompatible(
      makeDish({ dietType: dishDiet, ingredients: [makeIngredient()] }),
      effective,
      config,
    );
  }

  it("vegetarian household excludes non-veg / eggetarian / pescatarian", () => {
    expect(check("vegetarian", "vegetarian")).toBe(true);
    expect(check("vegetarian", "vegan")).toBe(true);
    expect(check("vegetarian", "jain")).toBe(true);
    expect(check("vegetarian", "non_vegetarian")).toBe(false);
    expect(check("vegetarian", "eggetarian")).toBe(false);
    expect(check("vegetarian", "pescatarian")).toBe(false);
  });

  it("non_vegetarian household accepts every diet", () => {
    for (const dishDiet of [
      "vegetarian",
      "vegan",
      "eggetarian",
      "non_vegetarian",
      "jain",
      "pescatarian",
    ] as DietType[]) {
      expect(check("non_vegetarian", dishDiet)).toBe(true);
    }
  });

  it("pescatarian household accepts fish but not other meat", () => {
    expect(check("pescatarian", "pescatarian")).toBe(true);
    expect(check("pescatarian", "vegetarian")).toBe(true);
    expect(check("pescatarian", "non_vegetarian")).toBe(false);
  });

  it("eggetarian household accepts eggs but not meat/fish", () => {
    expect(check("eggetarian", "eggetarian")).toBe(true);
    expect(check("eggetarian", "vegetarian")).toBe(true);
    expect(check("eggetarian", "non_vegetarian")).toBe(false);
    expect(check("eggetarian", "pescatarian")).toBe(false);
  });
});

describe("isDietCompatible — vegan ingredient refinement", () => {
  it("excludes a vegetarian dish that contains a dairy ingredient", () => {
    const paneerDish = makeDish({
      dietType: "vegetarian",
      ingredients: [
        makeIngredient({
          ingredientId: "ing-paneer",
          name: "paneer",
          category: "dairy",
        }),
      ],
    });
    expect(isDietCompatible(paneerDish, "vegan", config)).toBe(false);
  });

  it("excludes by an egg keyword even if the category is benign", () => {
    const eggDish = makeDish({
      dietType: "vegetarian",
      ingredients: [
        makeIngredient({
          ingredientId: "ing-egg",
          name: "egg",
          category: "pantry",
        }),
      ],
    });
    expect(isDietCompatible(eggDish, "vegan", config)).toBe(false);
  });

  it("allows a dairy-free vegetarian dish for a vegan household", () => {
    const veganOkDish = makeDish({
      dietType: "vegetarian",
      ingredients: [
        makeIngredient({
          ingredientId: "ing-rice",
          name: "rice",
          category: "grains",
        }),
        makeIngredient({
          ingredientId: "ing-dal",
          name: "toor dal",
          category: "lentils",
        }),
      ],
    });
    expect(isDietCompatible(veganOkDish, "vegan", config)).toBe(true);
  });
});

describe("isDietCompatible — jain ingredient refinement", () => {
  it("excludes a dish containing onion or garlic", () => {
    const onionDish = makeDish({
      dietType: "vegetarian",
      ingredients: [
        makeIngredient({
          ingredientId: "ing-onion",
          name: "onion",
          category: "vegetables",
        }),
      ],
    });
    expect(isDietCompatible(onionDish, "jain", config)).toBe(false);
  });

  it("allows an onion/garlic-free dish for a jain household", () => {
    const jainOkDish = makeDish({
      dietType: "jain",
      ingredients: [makeIngredient({ name: "rice", category: "grains" })],
    });
    expect(isDietCompatible(jainOkDish, "jain", config)).toBe(true);
  });
});
