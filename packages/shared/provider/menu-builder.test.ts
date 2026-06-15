import { describe, expect, it } from "vitest";

import type { CatalogItemDto } from "./dtos";
import { providerFixtures as f } from "./index";
import {
  defaultCutoffIso,
  eligibleAlternatives,
  emptyMenuBuilderState,
  isMenuBuilderCreatable,
  isMenuBuilderPublishable,
  isoToLocalDateTime,
  localDateTimeToIso,
  makeComponentDraft,
  menuBuilderIssues,
  menuBuilderStateToCreateInput,
  previewMenuDayFromBuilder,
  providerTodayDate,
  summarizeMenuIssues,
  type MenuBuilderState,
} from "./menu-builder";

const NOW = new Date("2026-06-15T09:00:00Z");
const FUTURE_CUTOFF = "2026-06-15T20:00:00Z";
const PAST_CUTOFF = "2026-06-15T06:00:00Z";

const rajma = f.catalogItems.find((c) => c.name === "Rajma")!;
const chana = f.catalogItems.find((c) => c.name === "Chana Masala")!;
const roti = f.catalogItems.find((c) => c.name === "Roti")!;

/** A two-component, publishable builder: dal (Rajma, Chana alt) + bread (Roti). */
function publishableState(): MenuBuilderState {
  return {
    menuDate: "2026-06-15",
    cutoffAt: FUTURE_CUTOFF,
    note: "  Festive thali  ",
    components: [
      {
        ...makeComponentDraft(rajma, "k-dal"),
        alternativeCatalogItemIds: [chana.catalogItemId],
      },
      makeComponentDraft(roti, "k-bread"),
    ],
  };
}

describe("emptyMenuBuilderState", () => {
  it("starts with the given date/cutoff and no components", () => {
    const s = emptyMenuBuilderState("2026-06-20", FUTURE_CUTOFF);
    expect(s).toEqual({
      menuDate: "2026-06-20",
      cutoffAt: FUTURE_CUTOFF,
      note: "",
      components: [],
    });
  });
});

describe("makeComponentDraft", () => {
  it("derives the group from the item and defaults to required, no swaps", () => {
    const draft = makeComponentDraft(rajma, "k1");
    expect(draft).toEqual({
      key: "k1",
      componentGroup: "dal_or_legume",
      defaultCatalogItemId: rajma.catalogItemId,
      isRequired: true,
      alternativeCatalogItemIds: [],
      customizationGroups: [],
    });
  });
});

describe("eligibleAlternatives", () => {
  it("offers only active, same-group items other than the default", () => {
    const draft = makeComponentDraft(rajma, "k1");
    const alts = eligibleAlternatives(draft, f.catalogItems);
    expect(alts.map((a) => a.name)).toEqual(["Chana Masala"]);
  });

  it("never offers an archived item", () => {
    const archivedChana: CatalogItemDto = { ...chana, isActive: false };
    const draft = makeComponentDraft(rajma, "k1");
    const alts = eligibleAlternatives(draft, [rajma, archivedChana, roti]);
    expect(alts).toHaveLength(0);
  });
});

describe("menuBuilderStateToCreateInput", () => {
  it("maps drafts to catalog-id structure and trims the note", () => {
    const input = menuBuilderStateToCreateInput(publishableState());
    expect(input.menuDate).toBe("2026-06-15");
    expect(input.cutoffAt).toBe(FUTURE_CUTOFF);
    expect(input.note).toBe("Festive thali");
    expect(input.components).toEqual([
      {
        componentGroup: "dal_or_legume",
        defaultCatalogItemId: rajma.catalogItemId,
        isRequired: true,
        alternativeCatalogItemIds: [chana.catalogItemId],
        customizationGroups: [],
      },
      {
        componentGroup: "bread",
        defaultCatalogItemId: roti.catalogItemId,
        isRequired: true,
        alternativeCatalogItemIds: [],
        customizationGroups: [],
      },
    ]);
  });

  it("nulls a blank note and drops a draft without a default item", () => {
    const s = publishableState();
    s.note = "   ";
    s.components.push({
      key: "k-empty",
      componentGroup: "sabzi",
      defaultCatalogItemId: "",
      isRequired: false,
      alternativeCatalogItemIds: [],
      customizationGroups: [],
    });
    const input = menuBuilderStateToCreateInput(s);
    expect(input.note).toBeNull();
    expect(input.components).toHaveLength(2);
  });
});

describe("previewMenuDayFromBuilder", () => {
  it("denormalizes name/quantity/unit/spice off the catalog", () => {
    const preview = previewMenuDayFromBuilder(
      publishableState(),
      f.catalogItems,
    );
    const dal = preview.components[0]!;
    expect(dal.defaultItemName).toBe("Rajma");
    expect(dal.defaultQuantity).toBe(16);
    expect(dal.canonicalUnit).toBe("oz");
    expect(dal.supportsSpiceLevel).toBe(true);
    expect(dal.alternatives[0]).toMatchObject({
      catalogItemId: chana.catalogItemId,
      itemName: "Chana Masala",
      quantity: 16,
      canonicalUnit: "oz",
    });
  });

  it("denormalizes a default no longer in the catalog to a blank/zero slot", () => {
    const s = emptyMenuBuilderState("2026-06-15", FUTURE_CUTOFF);
    s.components = [makeComponentDraft(rajma, "k1")];
    // Catalog without Rajma — e.g. it was archived/removed since the draft was built.
    const preview = previewMenuDayFromBuilder(s, [roti]);
    expect(preview.components[0]!.defaultItemName).toBe("");
    expect(preview.components[0]!.defaultQuantity).toBe(0);
  });
});

describe("menuBuilderIssues / isMenuBuilderPublishable", () => {
  it("a complete, future-cutoff menu is publishable", () => {
    expect(menuBuilderIssues(publishableState(), f.catalogItems, NOW)).toEqual(
      [],
    );
    expect(
      isMenuBuilderPublishable(publishableState(), f.catalogItems, NOW),
    ).toBe(true);
  });

  it("a cutoff in the past blocks publish (cutoff_in_past)", () => {
    const s = publishableState();
    s.cutoffAt = PAST_CUTOFF;
    const issues = menuBuilderIssues(s, f.catalogItems, NOW);
    expect(issues.some((i) => i.rule === "cutoff_in_past")).toBe(true);
    expect(isMenuBuilderPublishable(s, f.catalogItems, NOW)).toBe(false);
  });

  it("an empty menu is not publishable (menu_empty)", () => {
    const s = emptyMenuBuilderState("2026-06-15", FUTURE_CUTOFF);
    const issues = menuBuilderIssues(s, f.catalogItems, NOW);
    expect(issues.some((i) => i.rule === "menu_empty")).toBe(true);
  });

  it("an alternative with a different unit blocks publish (inconsistent_unit)", () => {
    // A same-group dal sold in a different unit than the default.
    const bowlDal: CatalogItemDto = {
      ...chana,
      catalogItemId: "00000000-0000-0000-0000-0000000000aa",
      name: "Dal Bowl",
      canonicalUnit: "bowl",
    };
    const s = emptyMenuBuilderState("2026-06-15", FUTURE_CUTOFF);
    s.components = [
      {
        ...makeComponentDraft(rajma, "k-dal"),
        alternativeCatalogItemIds: [bowlDal.catalogItemId],
      },
    ];
    const issues = menuBuilderIssues(s, [rajma, bowlDal], NOW);
    expect(issues.some((i) => i.rule === "inconsistent_unit")).toBe(true);
  });
});

describe("isMenuBuilderCreatable", () => {
  it("is creatable with a date, cutoff, and ≥1 component even if cutoff is past", () => {
    const s = publishableState();
    s.cutoffAt = PAST_CUTOFF;
    expect(isMenuBuilderCreatable(s)).toBe(true);
  });

  it("is not creatable with no components", () => {
    expect(
      isMenuBuilderCreatable(
        emptyMenuBuilderState("2026-06-15", FUTURE_CUTOFF),
      ),
    ).toBe(false);
  });

  it("is not creatable with a malformed date or empty cutoff", () => {
    const s = publishableState();
    expect(isMenuBuilderCreatable({ ...s, menuDate: "nope" })).toBe(false);
    expect(isMenuBuilderCreatable({ ...s, cutoffAt: "" })).toBe(false);
  });
});

describe("summarizeMenuIssues", () => {
  it("dedupes repeated messages in first-seen order", () => {
    const messages = summarizeMenuIssues([
      { field: "a", rule: "x", message: "First problem." },
      { field: "b", rule: "y", message: "Second problem." },
      { field: "c", rule: "x", message: "First problem." },
    ]);
    expect(messages).toEqual(["First problem.", "Second problem."]);
  });

  it("falls back to the rule when no message is present", () => {
    expect(summarizeMenuIssues([{ field: "a", rule: "menu_empty" }])).toEqual([
      "menu_empty",
    ]);
  });
});

describe("date / cutoff helpers", () => {
  it("providerTodayDate formats the date in the given tz", () => {
    // 2026-06-15T20:00Z is already 2026-06-16 in Asia/Kolkata (+5:30).
    const lateUtc = new Date("2026-06-15T20:00:00Z");
    expect(providerTodayDate("Asia/Kolkata", lateUtc)).toBe("2026-06-16");
    expect(providerTodayDate("UTC", lateUtc)).toBe("2026-06-15");
  });

  it("defaultCutoffIso adds the given hours", () => {
    expect(defaultCutoffIso(new Date("2026-06-15T09:00:00Z"), 8)).toBe(
      "2026-06-15T17:00:00.000Z",
    );
  });

  it("localDateTimeToIso returns '' for empty/invalid and an ISO otherwise", () => {
    expect(localDateTimeToIso("")).toBe("");
    expect(localDateTimeToIso("not-a-date")).toBe("");
    expect(localDateTimeToIso("2026-06-15T17:00:00Z")).toBe(
      "2026-06-15T17:00:00.000Z",
    );
  });

  it("isoToLocalDateTime round-trips a valid ISO and rejects an invalid one", () => {
    expect(isoToLocalDateTime("bad")).toBe("");
    // Round-trip through the same helpers stays stable (host tz cancels out).
    const local = isoToLocalDateTime("2026-06-15T17:00:00.000Z");
    expect(localDateTimeToIso(local)).toBe("2026-06-15T17:00:00.000Z");
  });
});
