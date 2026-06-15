import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";

import { validateCreateMenuDay } from "./menu-authoring-validation";

const ITEM_A = "11111111-1111-1111-1111-111111111111";
const ITEM_B = "22222222-2222-2222-2222-222222222222";

/** A minimal-but-valid create-menu-day body. */
function validBody(overrides: Record<string, unknown> = {}) {
  return {
    menuDate: "2030-03-15",
    cutoffAt: "2030-03-15T10:00:00.000Z",
    components: [{ componentGroup: "main", defaultCatalogItemId: ITEM_A }],
    ...overrides,
  };
}

/** Run the validator and return the aggregated issue rules for a thrown error. */
function issuesOf(body: Record<string, unknown>): string[] {
  try {
    validateCreateMenuDay(body);
  } catch (e) {
    if (e instanceof ValidationError) {
      return (e.details ?? []).map((i) => `${i.field}:${i.rule}`);
    }
  }
  return [];
}

describe("validateCreateMenuDay", () => {
  it("normalizes a full valid payload (defaults + assigned sort orders)", () => {
    const result = validateCreateMenuDay({
      menuDate: "2030-03-15",
      cutoffAt: "2030-03-15T10:00:00.000Z",
      note: "  Chef special  ",
      components: [
        {
          componentGroup: "main",
          defaultCatalogItemId: ITEM_A,
          alternativeCatalogItemIds: [ITEM_B],
          customizationGroups: [
            {
              name: "Extra gravy",
              customizationType: "quantity_increment",
              maximumSelections: 2,
              options: [
                { code: "gravy", label: "Extra gravy", quantityDelta: 50 },
              ],
            },
          ],
        },
      ],
    });

    expect(result.menuDate).toBe("2030-03-15");
    // The timestamp is normalized to canonical ISO-8601 UTC.
    expect(result.cutoffAt).toBe("2030-03-15T10:00:00.000Z");
    expect(result.note).toBe("Chef special");
    expect(result.components).toHaveLength(1);
    const comp = result.components[0]!;
    expect(comp.sortOrder).toBe(0);
    expect(comp.isRequired).toBe(true); // defaulted
    expect(comp.alternativeCatalogItemIds).toEqual([ITEM_B]);
    const group = comp.customizationGroups[0]!;
    expect(group.includedInPrice).toBe(true); // defaulted
    expect(group.isRequired).toBe(false); // defaulted
    expect(group.minimumSelections).toBe(0); // defaulted
    expect(group.maximumSelections).toBe(2);
    expect(group.sortOrder).toBe(0);
    expect(group.options[0]).toMatchObject({
      code: "gravy",
      label: "Extra gravy",
      quantityDelta: 50,
      canonicalUnit: null,
      sortOrder: 0,
    });
  });

  it("defaults note to null when absent", () => {
    expect(validateCreateMenuDay(validBody()).note).toBeNull();
  });

  it("rejects a missing / malformed menuDate", () => {
    expect(issuesOf(validBody({ menuDate: undefined }))).toContain(
      "menuDate:date",
    );
    expect(issuesOf(validBody({ menuDate: "2030-13-40" }))).toContain(
      "menuDate:date",
    );
  });

  it("rejects a malformed cutoffAt", () => {
    expect(issuesOf(validBody({ cutoffAt: "not-a-date" }))).toContain(
      "cutoffAt:datetime",
    );
  });

  it("rejects an empty or missing components array", () => {
    expect(issuesOf(validBody({ components: [] }))).toContain(
      "components:required",
    );
    expect(issuesOf(validBody({ components: undefined }))).toContain(
      "components:required",
    );
  });

  it("flags a bad component group and a bad default item id with indexed paths", () => {
    const rules = issuesOf(
      validBody({
        components: [
          { componentGroup: "not_a_group", defaultCatalogItemId: "nope" },
        ],
      }),
    );
    expect(rules).toContain("components[0].componentGroup:enum");
    expect(rules).toContain("components[0].defaultCatalogItemId:uuid");
  });

  it("flags a bad alternative id under its component", () => {
    expect(
      issuesOf(
        validBody({
          components: [
            {
              componentGroup: "main",
              defaultCatalogItemId: ITEM_A,
              alternativeCatalogItemIds: ["bad"],
            },
          ],
        }),
      ),
    ).toContain("components[0].alternativeCatalogItemIds[0]:uuid");
  });

  it("flags a bad customization type and a missing option code", () => {
    const rules = issuesOf(
      validBody({
        components: [
          {
            componentGroup: "main",
            defaultCatalogItemId: ITEM_A,
            customizationGroups: [
              {
                name: "Group",
                customizationType: "not_a_type",
                options: [{ label: "no code" }],
              },
            ],
          },
        ],
      }),
    );
    expect(rules).toContain(
      "components[0].customizationGroups[0].customizationType:enum",
    );
    expect(rules).toContain(
      "components[0].customizationGroups[0].options[0].code:required",
    );
  });

  it("rejects an option quantity that exceeds the numeric(10,3) scale", () => {
    expect(
      issuesOf(
        validBody({
          components: [
            {
              componentGroup: "main",
              defaultCatalogItemId: ITEM_A,
              customizationGroups: [
                {
                  name: "G",
                  customizationType: "quantity_increment",
                  maximumSelections: 1,
                  options: [{ code: "x", label: "X", quantityDelta: 1.2345 }],
                },
              ],
            },
          ],
        }),
      ),
    ).toContain(
      "components[0].customizationGroups[0].options[0].quantityDelta:scale",
    );
  });

  it("throws a ValidationError aggregating every issue", () => {
    expect(() => validateCreateMenuDay({})).toThrow(ValidationError);
  });
});
