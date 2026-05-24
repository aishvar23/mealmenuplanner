import { describe, expect, it } from "vitest";

import {
  containsWord,
  ingredientMatchesAnyTerm,
  normalizeTerm,
} from "@/lib/recommendation/text-match";

describe("normalizeTerm", () => {
  it("lowercases and trims", () => {
    expect(normalizeTerm("  Paneer ")).toBe("paneer");
  });
});

describe("containsWord", () => {
  it("matches an exact term and a whole word within text", () => {
    expect(containsWord("egg", "egg")).toBe(true);
    expect(containsWord("egg white", "egg")).toBe(true);
    expect(containsWord("organic milk powder", "milk")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(containsWord("Whole Milk", "MILK")).toBe(true);
  });

  it("does not match a substring of a longer word", () => {
    expect(containsWord("eggplant", "egg")).toBe(false);
    expect(containsWord("garlicky", "garlic")).toBe(false);
  });

  it("matches across non-alphanumeric boundaries (underscores, hyphens)", () => {
    expect(containsWord("tree_nuts", "nuts")).toBe(true);
    expect(containsWord("spring-onion", "onion")).toBe(true);
  });

  it("never matches an empty/blank term", () => {
    expect(containsWord("anything", "")).toBe(false);
    expect(containsWord("anything", "   ")).toBe(false);
  });

  it("matches a multi-word term", () => {
    expect(containsWord("fresh spring onion stalks", "spring onion")).toBe(
      true,
    );
  });
});

describe("ingredientMatchesAnyTerm", () => {
  const paneer = {
    name: "Paneer",
    commonNames: ["cottage cheese", "Indian cheese"],
    allergenType: "dairy",
  };

  it("matches by name", () => {
    expect(ingredientMatchesAnyTerm(paneer, ["paneer"])).toBe(true);
  });

  it("matches by common name", () => {
    expect(ingredientMatchesAnyTerm(paneer, ["cottage cheese"])).toBe(true);
  });

  it("matches by allergen type", () => {
    expect(ingredientMatchesAnyTerm(paneer, ["dairy"])).toBe(true);
  });

  it("returns false when nothing matches", () => {
    expect(ingredientMatchesAnyTerm(paneer, ["peanut", "gluten"])).toBe(false);
  });

  it("tolerates a null allergen type", () => {
    const rice = { name: "rice", commonNames: [], allergenType: null };
    expect(ingredientMatchesAnyTerm(rice, ["dairy"])).toBe(false);
  });
});
