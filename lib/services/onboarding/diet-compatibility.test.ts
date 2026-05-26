import { describe, expect, it } from "vitest";

import { DIET_COMPATIBILITY, allowedDietsFor } from "./diet-compatibility";

describe("allowedDietsFor", () => {
  it("returns only the same diet for the strictest diets", () => {
    expect(allowedDietsFor("vegan")).toEqual(["vegan"]);
    expect(allowedDietsFor("jain")).toEqual(["jain"]);
  });

  it("widens vegetarian to include vegan and jain", () => {
    expect(allowedDietsFor("vegetarian")).toEqual([
      "vegetarian",
      "vegan",
      "jain",
    ]);
  });

  it("lets non_vegetarian see every diet (the most permissive)", () => {
    const allowed = allowedDietsFor("non_vegetarian");
    expect(allowed).toEqual([
      "non_vegetarian",
      "pescatarian",
      "eggetarian",
      "vegetarian",
      "vegan",
      "jain",
    ]);
  });

  it("never offers a stricter household a more permissive diet", () => {
    // The compatibility set for a diet must never contain a diet that does not,
    // in turn, allow it back — i.e. compatibility flows strict→permissive only.
    expect(allowedDietsFor("vegan")).not.toContain("non_vegetarian");
    expect(allowedDietsFor("jain")).not.toContain("vegetarian");
    expect(allowedDietsFor("eggetarian")).not.toContain("non_vegetarian");
  });

  it("returns null for a missing or unknown diet (caller shows everything)", () => {
    expect(allowedDietsFor(undefined)).toBeNull();
    expect(allowedDietsFor(null)).toBeNull();
    expect(allowedDietsFor("")).toBeNull();
    expect(allowedDietsFor("keto")).toBeNull();
  });

  it("always includes the diet itself in its own compatibility set", () => {
    for (const diet of Object.keys(DIET_COMPATIBILITY)) {
      expect(allowedDietsFor(diet)).toContain(diet);
    }
  });
});
