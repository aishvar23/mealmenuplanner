import { describe, expect, it } from "vitest";

import { ValidationError, type ValidationIssue } from "@/lib/errors";

import { validateSaveProviderResponse } from "./response-validation";

const COMP = "11111111-1111-1111-1111-111111111111";
const ITEM = "22222222-2222-2222-2222-222222222222";
const OPT = "33333333-3333-3333-3333-333333333333";

/** Run the validator and capture the aggregated issues from the thrown error. */
function issuesOf(body: unknown): ValidationIssue[] {
  try {
    validateSaveProviderResponse(body as never);
  } catch (err) {
    if (err instanceof ValidationError) return err.details ?? [];
    throw err;
  }
  throw new Error("expected a ValidationError");
}

describe("validateSaveProviderResponse", () => {
  it("normalizes a valid body and drops the server-derived quantity/unit fields", () => {
    const result = validateSaveProviderResponse({
      expectedVersion: 4,
      memberNote: "  no onions  ",
      items: [
        {
          menuComponentId: COMP,
          selectedCatalogItemId: ITEM,
          // client-sent quantity/canonicalUnit are IGNORED (server derives them).
          quantity: 999,
          canonicalUnit: "made-up",
          spiceLevel: "regular",
          saltLevel: null,
          customizations: [{ customizationOptionId: OPT, quantity: 2 }],
        },
      ],
    });

    expect(result).toEqual({
      expectedVersion: 4,
      memberNote: "no onions",
      items: [
        {
          menuComponentId: COMP,
          selectedCatalogItemId: ITEM,
          spiceLevel: "regular",
          saltLevel: null,
          customizations: [{ customizationOptionId: OPT, quantity: 2 }],
        },
      ],
    });
    // The normalized item must not carry the ignored fields.
    expect(result.items[0]).not.toHaveProperty("quantity");
    expect(result.items[0]).not.toHaveProperty("canonicalUnit");
  });

  it("treats a missing expectedVersion as null (first save) and a missing note as null", () => {
    const result = validateSaveProviderResponse({
      items: [{ menuComponentId: COMP, selectedCatalogItemId: ITEM }],
    });
    expect(result.expectedVersion).toBeNull();
    expect(result.memberNote).toBeNull();
    expect(result.items[0]?.customizations).toEqual([]);
  });

  it("allows an empty items array (clearing a draft's selections)", () => {
    const result = validateSaveProviderResponse({
      expectedVersion: null,
      items: [],
    });
    expect(result.items).toEqual([]);
  });

  it("rejects a non-array items", () => {
    expect(issuesOf({ items: "nope" })).toContainEqual({
      field: "items",
      rule: "array",
    });
  });

  it("rejects a non-integer expectedVersion", () => {
    expect(issuesOf({ expectedVersion: 1.5, items: [] })).toContainEqual({
      field: "expectedVersion",
      rule: "integer",
    });
  });

  it("accepts expectedVersion 0 (the empty-shape version a first save echoes back)", () => {
    // The 'no response yet' DTO carries version 0; a client echoing it back sends 0.
    // The validator must pass 0 through (the RPC treats 0 like null = no prior
    // version on a first save) rather than reject it.
    const result = validateSaveProviderResponse({
      expectedVersion: 0,
      items: [],
    });
    expect(result.expectedVersion).toBe(0);
  });

  it("rejects a bad component / catalog uuid", () => {
    const issues = issuesOf({
      items: [{ menuComponentId: "x", selectedCatalogItemId: "y" }],
    });
    expect(issues).toContainEqual({
      field: "items[0].menuComponentId",
      rule: "uuid",
    });
    expect(issues).toContainEqual({
      field: "items[0].selectedCatalogItemId",
      rule: "uuid",
    });
  });

  it("rejects an out-of-set spice/salt level", () => {
    const issues = issuesOf({
      items: [
        {
          menuComponentId: COMP,
          selectedCatalogItemId: ITEM,
          spiceLevel: "nuclear",
          saltLevel: "none",
        },
      ],
    });
    expect(issues.map((i) => i.field)).toEqual(
      expect.arrayContaining(["items[0].spiceLevel", "items[0].saltLevel"]),
    );
  });

  it("rejects a non-positive customization quantity", () => {
    expect(
      issuesOf({
        items: [
          {
            menuComponentId: COMP,
            selectedCatalogItemId: ITEM,
            customizations: [{ customizationOptionId: OPT, quantity: 0 }],
          },
        ],
      }),
    ).toContainEqual({
      field: "items[0].customizations[0].quantity",
      rule: "positive",
    });
  });

  it("caps the number of items", () => {
    const many = Array.from({ length: 31 }, () => ({
      menuComponentId: COMP,
      selectedCatalogItemId: ITEM,
    }));
    expect(issuesOf({ items: many })).toContainEqual({
      field: "items",
      rule: "max",
      max: 30,
    });
  });
});
