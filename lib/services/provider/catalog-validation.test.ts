import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";

import {
  validateCreateCatalogItem,
  validateUpdateCatalogItem,
} from "./catalog-validation";

const VALID = {
  name: "Rajma",
  componentGroup: "dal_or_legume",
  canonicalUnit: "oz",
  defaultQuantity: 16,
};

const DISH_ID = "11111111-1111-1111-1111-111111111111";

/** Run a validator and capture the thrown ValidationError's field issues. */
function issuesOf(fn: () => unknown): { field?: string; rule?: string }[] {
  try {
    fn();
  } catch (e) {
    if (e instanceof ValidationError) return e.details ?? [];
    throw e;
  }
  throw new Error("expected a ValidationError");
}

describe("validateCreateCatalogItem", () => {
  it("normalizes a valid body to DB column values with defaults", () => {
    expect(validateCreateCatalogItem({ ...VALID })).toEqual({
      name: "Rajma",
      component_group: "dal_or_legume",
      canonical_unit: "oz",
      default_quantity: 16,
      image_url: null,
      supports_spice_level: false,
      supports_salt_level: false,
      allergy_warning: null,
      source_dish_id: null,
    });
  });

  it("trims text, keeps flags, and passes through a valid sourceDishId", () => {
    const result = validateCreateCatalogItem({
      name: "  Roti  ",
      componentGroup: "bread",
      canonicalUnit: "  piece ",
      defaultQuantity: 2,
      supportsSpiceLevel: false,
      supportsSaltLevel: true,
      allergyWarning: "  Contains wheat (gluten). ",
      sourceDishId: DISH_ID,
    });
    expect(result.name).toBe("Roti");
    expect(result.canonical_unit).toBe("piece");
    expect(result.supports_salt_level).toBe(true);
    expect(result.allergy_warning).toBe("Contains wheat (gluten).");
    expect(result.source_dish_id).toBe(DISH_ID);
  });

  it("requires a non-empty name", () => {
    expect(
      issuesOf(() => validateCreateCatalogItem({ ...VALID, name: "  " })),
    ).toEqual([{ field: "name", rule: "required" }]);
  });

  it("rejects an unknown component group", () => {
    const issues = issuesOf(() =>
      validateCreateCatalogItem({ ...VALID, componentGroup: "dessert" }),
    );
    expect(issues[0]?.field).toBe("componentGroup");
    expect(issues[0]?.rule).toBe("enum");
  });

  it("rejects a non-positive default quantity", () => {
    expect(
      issuesOf(() =>
        validateCreateCatalogItem({ ...VALID, defaultQuantity: 0 }),
      ),
    ).toEqual([{ field: "defaultQuantity", rule: "positive" }]);
    expect(
      issuesOf(() =>
        validateCreateCatalogItem({ ...VALID, defaultQuantity: -1 }),
      ),
    ).toEqual([{ field: "defaultQuantity", rule: "positive" }]);
  });

  it("rejects a non-number default quantity", () => {
    expect(
      issuesOf(() =>
        validateCreateCatalogItem({ ...VALID, defaultQuantity: "16" }),
      ),
    ).toEqual([{ field: "defaultQuantity", rule: "positive" }]);
  });

  it("rejects a malformed sourceDishId", () => {
    expect(
      issuesOf(() =>
        validateCreateCatalogItem({ ...VALID, sourceDishId: "not-a-uuid" }),
      ),
    ).toEqual([{ field: "sourceDishId", rule: "uuid" }]);
  });

  it("rejects a non-boolean flag", () => {
    expect(
      issuesOf(() =>
        validateCreateCatalogItem({ ...VALID, supportsSpiceLevel: "yes" }),
      ),
    ).toEqual([{ field: "supportsSpiceLevel", rule: "type" }]);
  });

  it("aggregates multiple field issues", () => {
    const issues = issuesOf(() =>
      validateCreateCatalogItem({
        name: "",
        componentGroup: "x",
        defaultQuantity: 0,
      }),
    );
    const fields = issues.map((i) => i.field);
    expect(fields).toContain("name");
    expect(fields).toContain("componentGroup");
    expect(fields).toContain("canonicalUnit");
    expect(fields).toContain("defaultQuantity");
  });
});

describe("validateUpdateCatalogItem", () => {
  it("returns only the present keys in DB column shape", () => {
    expect(
      validateUpdateCatalogItem({ name: " New name ", defaultQuantity: 20 }),
    ).toEqual({ name: "New name", default_quantity: 20 });
  });

  it("accepts an empty patch (no-op)", () => {
    expect(validateUpdateCatalogItem({})).toEqual({});
  });

  it("maps isActive to the archive column", () => {
    expect(validateUpdateCatalogItem({ isActive: false })).toEqual({
      is_active: false,
    });
    expect(validateUpdateCatalogItem({ isActive: true })).toEqual({
      is_active: true,
    });
  });

  it("clears a nullable field when sent null or blank", () => {
    expect(validateUpdateCatalogItem({ allergyWarning: null })).toEqual({
      allergy_warning: null,
    });
    expect(validateUpdateCatalogItem({ allergyWarning: "   " })).toEqual({
      allergy_warning: null,
    });
    expect(validateUpdateCatalogItem({ sourceDishId: null })).toEqual({
      source_dish_id: null,
    });
  });

  it("rejects an invalid component group / quantity / isActive in a patch", () => {
    expect(
      issuesOf(() => validateUpdateCatalogItem({ componentGroup: "soup" }))[0]
        ?.field,
    ).toBe("componentGroup");
    expect(
      issuesOf(() => validateUpdateCatalogItem({ defaultQuantity: -2 })),
    ).toEqual([{ field: "defaultQuantity", rule: "positive" }]);
    expect(
      issuesOf(() => validateUpdateCatalogItem({ isActive: "no" })),
    ).toEqual([{ field: "isActive", rule: "type" }]);
  });

  it("rejects a blank required name in a patch", () => {
    expect(issuesOf(() => validateUpdateCatalogItem({ name: "  " }))).toEqual([
      { field: "name", rule: "required" },
    ]);
  });
});
