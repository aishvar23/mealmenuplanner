import { describe, expect, it } from "vitest";

import type { CatalogItemDto } from "./dtos";
import {
  catalogFormFromItem,
  catalogFormIssues,
  catalogFormToCreateRequest,
  catalogFormToUpdateRequest,
  emptyCatalogForm,
  groupCatalogByComponent,
  isCatalogFormValid,
  parseCatalogQuantity,
  type CatalogFormState,
} from "./catalog-form";

/**
 * Unit tests for the shared catalog-management form model (ADO #88). It is the pure
 * core both the web manager and the mobile screen drive, so the add/edit gate and the
 * wire serialization behave identically on both platforms.
 */

function validForm(
  overrides: Partial<CatalogFormState> = {},
): CatalogFormState {
  return {
    name: "Rajma",
    componentGroup: "dal_or_legume",
    canonicalUnit: "oz",
    defaultQuantity: "16",
    imageUrl: "",
    allergyWarning: "",
    supportsSpiceLevel: true,
    supportsSaltLevel: false,
    ...overrides,
  };
}

const ITEM: CatalogItemDto = {
  catalogItemId: "c1",
  name: "Rajma",
  componentGroup: "dal_or_legume",
  canonicalUnit: "oz",
  defaultQuantity: 16,
  imageUrl: "https://img.example.com/rajma.jpg",
  isActive: true,
  supportsSpiceLevel: true,
  supportsSaltLevel: false,
  allergyWarning: "Contains soy",
  sourceDishId: null,
};

describe("emptyCatalogForm", () => {
  it("defaults to the first component group and blank fields", () => {
    const form = emptyCatalogForm();
    expect(form.componentGroup).toBe("main");
    expect(form.name).toBe("");
    expect(form.defaultQuantity).toBe("");
    expect(form.supportsSpiceLevel).toBe(false);
  });

  it("is not valid (a blank form fails the gate)", () => {
    expect(isCatalogFormValid(emptyCatalogForm())).toBe(false);
  });
});

describe("catalogFormFromItem", () => {
  it("hydrates the edit form, mapping nulls to empty strings and the quantity to text", () => {
    const form = catalogFormFromItem({
      ...ITEM,
      imageUrl: null,
      allergyWarning: null,
    });
    expect(form).toEqual({
      name: "Rajma",
      componentGroup: "dal_or_legume",
      canonicalUnit: "oz",
      defaultQuantity: "16",
      imageUrl: "",
      allergyWarning: "",
      supportsSpiceLevel: true,
      supportsSaltLevel: false,
    });
  });

  it("round-trips through the update request", () => {
    const req = catalogFormToUpdateRequest(catalogFormFromItem(ITEM));
    expect(req).toMatchObject({
      name: "Rajma",
      componentGroup: "dal_or_legume",
      canonicalUnit: "oz",
      defaultQuantity: 16,
      imageUrl: "https://img.example.com/rajma.jpg",
      allergyWarning: "Contains soy",
    });
  });
});

describe("parseCatalogQuantity", () => {
  it("parses a numeric string", () => {
    expect(parseCatalogQuantity("16")).toBe(16);
    expect(parseCatalogQuantity(" 2.5 ")).toBe(2.5);
  });
  it("returns null for empty or non-numeric", () => {
    expect(parseCatalogQuantity("")).toBeNull();
    expect(parseCatalogQuantity("abc")).toBeNull();
  });
});

describe("catalogFormIssues", () => {
  it("passes a well-formed form", () => {
    expect(catalogFormIssues(validForm())).toEqual({});
    expect(isCatalogFormValid(validForm())).toBe(true);
  });

  it("flags a blank name and unit", () => {
    const issues = catalogFormIssues(
      validForm({ name: "   ", canonicalUnit: "" }),
    );
    expect(issues.name).toBeDefined();
    expect(issues.canonicalUnit).toBeDefined();
  });

  it("flags a non-positive, empty, or non-numeric quantity", () => {
    expect(
      catalogFormIssues(validForm({ defaultQuantity: "0" })).defaultQuantity,
    ).toBeDefined();
    expect(
      catalogFormIssues(validForm({ defaultQuantity: "-3" })).defaultQuantity,
    ).toBeDefined();
    expect(
      catalogFormIssues(validForm({ defaultQuantity: "" })).defaultQuantity,
    ).toBeDefined();
    expect(
      catalogFormIssues(validForm({ defaultQuantity: "x" })).defaultQuantity,
    ).toBeDefined();
  });

  it("flags a quantity beyond the column's range or precision", () => {
    expect(
      catalogFormIssues(validForm({ defaultQuantity: "99999999" }))
        .defaultQuantity,
    ).toBeDefined();
    expect(
      catalogFormIssues(validForm({ defaultQuantity: "1.2345" }))
        .defaultQuantity,
    ).toBeDefined();
  });

  it("rejects a non-http(s) image URL but accepts https and blank", () => {
    expect(
      catalogFormIssues(validForm({ imageUrl: "javascript:alert(1)" }))
        .imageUrl,
    ).toBeDefined();
    expect(
      catalogFormIssues(validForm({ imageUrl: "not a url" })).imageUrl,
    ).toBeDefined();
    expect(
      catalogFormIssues(validForm({ imageUrl: "https://x.test/a.jpg" }))
        .imageUrl,
    ).toBeUndefined();
    expect(
      catalogFormIssues(validForm({ imageUrl: "" })).imageUrl,
    ).toBeUndefined();
  });

  it("flags an over-long allergy note", () => {
    expect(
      catalogFormIssues(validForm({ allergyWarning: "a".repeat(201) }))
        .allergyWarning,
    ).toBeDefined();
  });
});

describe("catalogFormToCreateRequest", () => {
  it("trims text, parses the quantity, and maps blank optionals to null", () => {
    const req = catalogFormToCreateRequest(
      validForm({
        name: "  Chana  ",
        canonicalUnit: " oz ",
        defaultQuantity: "12.5",
        imageUrl: "  ",
        allergyWarning: "  ",
      }),
    );
    expect(req).toEqual({
      name: "Chana",
      componentGroup: "dal_or_legume",
      canonicalUnit: "oz",
      defaultQuantity: 12.5,
      imageUrl: null,
      allergyWarning: null,
      supportsSpiceLevel: true,
      supportsSaltLevel: false,
    });
  });
});

describe("groupCatalogByComponent", () => {
  it("groups in plate order and drops empty groups", () => {
    const items: CatalogItemDto[] = [
      { ...ITEM, catalogItemId: "a", componentGroup: "bread", name: "Roti" },
      {
        ...ITEM,
        catalogItemId: "b",
        componentGroup: "dal_or_legume",
        name: "Rajma",
      },
      {
        ...ITEM,
        catalogItemId: "c",
        componentGroup: "dal_or_legume",
        name: "Chana",
      },
    ];
    const groups = groupCatalogByComponent(items);
    expect(groups.map((g) => g.group)).toEqual(["dal_or_legume", "bread"]);
    expect(groups[0]!.items.map((i) => i.name)).toEqual(["Rajma", "Chana"]);
    expect(groups[0]!.label).toBe("Dal / legume");
  });

  it("returns an empty array for no items", () => {
    expect(groupCatalogByComponent([])).toEqual([]);
  });
});
