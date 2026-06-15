import { describe, expect, it } from "vitest";

import type { MenuDayDto } from "./dtos";
import { providerFixtures as f } from "./index";
import {
  isMenuPublishable,
  validateMenuCompleteness,
} from "./menu-completeness";

// The canonical fixture's cutoff is 2026-06-11T14:30:00Z; evaluate "as published"
// from before it so the cutoff-in-the-future rule is satisfied for the happy path.
const BEFORE_CUTOFF = new Date("2026-06-11T00:00:00Z");

/** Deep clone so each negative case mutates an isolated copy of the fixture. */
function clone(menu: MenuDayDto): MenuDayDto {
  return structuredClone(menu);
}

/** The required dal component of the cloned fixture (`!` — present by construction). */
function dalOf(menu: MenuDayDto): MenuDayDto["components"][number] {
  return menu.components[0]!;
}

/** The dal component's first (quantity_increment) customization group. */
function incrementGroupOf(
  menu: MenuDayDto,
): MenuDayDto["components"][number]["customizationGroups"][number] {
  return dalOf(menu).customizationGroups[0]!;
}

/** The set of `rule` strings returned for a menu day. */
function rules(menu: MenuDayDto, now = BEFORE_CUTOFF): string[] {
  return validateMenuCompleteness(menu, now).map((issue) => issue.rule);
}

describe("validateMenuCompleteness (contract 03 § 5)", () => {
  it("accepts the canonical published fixture (no issues before cutoff)", () => {
    expect(validateMenuCompleteness(f.publishedMenuDay, BEFORE_CUTOFF)).toEqual(
      [],
    );
    expect(isMenuPublishable(f.publishedMenuDay, BEFORE_CUTOFF)).toBe(true);
  });

  it("flags an empty menu", () => {
    const menu = clone(f.publishedMenuDay);
    menu.components = [];
    expect(rules(menu)).toContain("menu_empty");
    expect(isMenuPublishable(menu, BEFORE_CUTOFF)).toBe(false);
  });

  it("flags a required component with no default item id or name", () => {
    const menu = clone(f.publishedMenuDay);
    const dal = dalOf(menu);
    dal.defaultCatalogItemId = "";
    dal.defaultItemName = "   ";
    const issues = validateMenuCompleteness(menu, BEFORE_CUTOFF);
    const missing = issues.filter((i) => i.rule === "missing_default_item");
    expect(missing).toHaveLength(2);
    expect(missing.map((i) => i.field)).toEqual([
      "components[0].defaultCatalogItemId",
      "components[0].defaultItemName",
    ]);
  });

  it("does NOT require a default for a non-required component", () => {
    const menu = clone(f.publishedMenuDay);
    // components[2] (rice) is isRequired:false.
    const rice = menu.components[2]!;
    rice.defaultCatalogItemId = "";
    rice.defaultItemName = "";
    expect(rules(menu)).not.toContain("missing_default_item");
  });

  it("flags a non-positive default or alternative quantity", () => {
    const menu = clone(f.publishedMenuDay);
    const dal = dalOf(menu);
    dal.defaultQuantity = 0;
    dal.alternatives[0]!.quantity = -1;
    const positives = rules(menu).filter((r) => r === "non_positive_quantity");
    expect(positives).toHaveLength(2);
  });

  it("flags an alternative whose unit differs from its component", () => {
    const menu = clone(f.publishedMenuDay);
    dalOf(menu).alternatives[0]!.canonicalUnit = "piece"; // component is "oz"
    expect(rules(menu)).toContain("inconsistent_unit");
  });

  it("flags a missing component unit", () => {
    const menu = clone(f.publishedMenuDay);
    dalOf(menu).canonicalUnit = "";
    expect(rules(menu)).toContain("missing_unit");
  });

  it("flags an alternative with a blank unit (missing AND inconsistent, not skipped)", () => {
    const menu = clone(f.publishedMenuDay);
    dalOf(menu).alternatives[0]!.canonicalUnit = "   "; // component is "oz"
    const ruleSet = rules(menu);
    // A blank denormalized alt unit is an unfilled slot...
    expect(ruleSet).toContain("missing_unit");
    // ...and the unit-consistency check is no longer skipped for blank alt units.
    expect(ruleSet).toContain("inconsistent_unit");
  });

  it("flags an unbounded quantity_increment group (null group max)", () => {
    const menu = clone(f.publishedMenuDay);
    incrementGroupOf(menu).maximumSelections = null;
    expect(rules(menu)).toContain("unbounded_increment");
  });

  it("flags an unbounded quantity_increment option (null option max)", () => {
    const menu = clone(f.publishedMenuDay);
    incrementGroupOf(menu).options[0]!.maximumQuantity = null;
    const issues = validateMenuCompleteness(menu, BEFORE_CUTOFF);
    const unbounded = issues.find((i) => i.rule === "unbounded_increment");
    expect(unbounded?.field).toBe(
      "components[0].customizationGroups[0].options[0].maximumQuantity",
    );
  });

  it("does NOT require a finite max for a non-increment group", () => {
    const menu = clone(f.publishedMenuDay);
    const group = incrementGroupOf(menu);
    group.customizationType = "multi_select";
    group.maximumSelections = null; // unbounded multi-select is allowed
    group.options[0]!.maximumQuantity = null;
    expect(rules(menu)).not.toContain("unbounded_increment");
  });

  it("flags a required customization group with no options or min < 1", () => {
    const menu = clone(f.publishedMenuDay);
    const group = incrementGroupOf(menu);
    group.isRequired = true;
    group.minimumSelections = 0;
    group.options = [];
    const ruleSet = rules(menu);
    expect(ruleSet.filter((r) => r === "invalid_required_group")).toHaveLength(
      2,
    );
  });

  it("flags selection bounds where min exceeds max", () => {
    const menu = clone(f.publishedMenuDay);
    const group = incrementGroupOf(menu);
    group.minimumSelections = 2;
    group.maximumSelections = 1;
    expect(rules(menu)).toContain("invalid_selection_bounds");
  });

  it("flags a cutoff that is at or before now", () => {
    // Same fixture, evaluated AFTER its cutoff.
    const afterCutoff = new Date("2026-06-11T15:00:00Z");
    expect(rules(f.publishedMenuDay, afterCutoff)).toContain("cutoff_in_past");
  });

  it("flags an unparseable cutoff timestamp", () => {
    const menu = clone(f.publishedMenuDay);
    menu.cutoffAt = "not-a-date";
    expect(rules(menu)).toContain("cutoff_invalid");
  });

  it("returns every distinct failed rule at once (does not short-circuit)", () => {
    const menu = clone(f.publishedMenuDay);
    menu.components = [];
    menu.cutoffAt = "not-a-date";
    const ruleSet = new Set(rules(menu));
    expect(ruleSet.has("menu_empty")).toBe(true);
    expect(ruleSet.has("cutoff_invalid")).toBe(true);
  });

  it("does not mutate the input menu", () => {
    const snapshot = structuredClone(f.publishedMenuDay);
    validateMenuCompleteness(f.publishedMenuDay, BEFORE_CUTOFF);
    expect(f.publishedMenuDay).toEqual(snapshot);
  });
});
