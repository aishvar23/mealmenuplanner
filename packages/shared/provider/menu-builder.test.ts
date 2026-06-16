import { describe, expect, it } from "vitest";

import type { CatalogItemDto } from "./dtos";
import { providerFixtures as f } from "./index";
import {
  addComponentDraft,
  addCustomizationGroup,
  addCustomizationOption,
  alternativeChoices,
  changeComponentDefault,
  changeCustomizationType,
  customizationInsertIssues,
  defaultCutoffIso,
  defaultCutoffLocalIso,
  editCatalog,
  eligibleAlternatives,
  emptyMenuBuilderState,
  hasUnavailableSelection,
  isMenuBuilderCreatable,
  isMenuBuilderPublishable,
  isMenuDayEditable,
  isoToLocalDateTime,
  localDateTimeToIso,
  makeComponentDraft,
  makeCustomizationGroup,
  makeCustomizationOption,
  MENU_REVISION_WARNING,
  menuBuilderIssues,
  menuBuilderStateFromMenuDay,
  menuBuilderStateToCreateInput,
  menuBuilderStateToEditInput,
  nextComponentKey,
  nextOptionCode,
  normalizeCustomizationGroup,
  patchComponentDraft,
  patchCustomizationGroup,
  patchCustomizationOption,
  previewMenuDayFromBuilder,
  providerTodayDate,
  removeComponentDraft,
  removeCustomizationGroup,
  removeCustomizationOption,
  summarizeMenuIssues,
  toggleComponentAlternative,
  type MenuBuilderState,
  type MenuComponentDraft,
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

describe("component transitions (pure reducers)", () => {
  const catalog = [rajma, chana, roti];

  describe("nextComponentKey", () => {
    it("is c1 for an empty list and one past the largest c<n> suffix", () => {
      expect(nextComponentKey([])).toBe("c1");
      expect(
        nextComponentKey([
          makeComponentDraft(rajma, "c1"),
          makeComponentDraft(chana, "c3"),
        ]),
      ).toBe("c4");
    });

    it("ignores non-`c<n>` keys and never reuses a removed key", () => {
      // c2 was removed, leaving c1 + c5 — the next key is c6, NOT a reused c2/c3.
      expect(
        nextComponentKey([
          makeComponentDraft(rajma, "c1"),
          makeComponentDraft(chana, "k-dal"),
          makeComponentDraft(roti, "c5"),
        ]),
      ).toBe("c6");
    });
  });

  describe("addComponentDraft", () => {
    it("appends a draft from the first catalog item with a c1 key", () => {
      const s = addComponentDraft(
        emptyMenuBuilderState("2026-06-15", FUTURE_CUTOFF),
        catalog,
      );
      expect(s.components).toHaveLength(1);
      expect(s.components[0]).toMatchObject({
        key: "c1",
        defaultCatalogItemId: rajma.catalogItemId,
        componentGroup: "dal_or_legume",
      });
    });

    it("returns the state unchanged when the catalog is empty", () => {
      const empty = emptyMenuBuilderState("2026-06-15", FUTURE_CUTOFF);
      expect(addComponentDraft(empty, [])).toBe(empty);
    });

    it("mints distinct keys when applied repeatedly to its own output (rapid add)", () => {
      // Simulates two `setState(prev => addComponentDraft(prev, catalog))` updaters
      // batching before a render flush: deriving the key from `prev` keeps them unique
      // even though no render-closure counter advanced between the two calls.
      let s = emptyMenuBuilderState("2026-06-15", FUTURE_CUTOFF);
      s = addComponentDraft(s, catalog);
      s = addComponentDraft(s, catalog);
      s = addComponentDraft(s, catalog);
      const keys = s.components.map((c) => c.key);
      expect(keys).toEqual(["c1", "c2", "c3"]);
      expect(new Set(keys).size).toBe(3);
    });
  });

  describe("removeComponentDraft", () => {
    it("drops the matching component and is a no-op for an unknown key", () => {
      const s = publishableState();
      const removed = removeComponentDraft(s, "k-dal");
      expect(removed.components.map((c) => c.key)).toEqual(["k-bread"]);
      expect(removeComponentDraft(s, "nope").components).toHaveLength(2);
    });
  });

  describe("patchComponentDraft", () => {
    it("shallow-merges into the matching component only", () => {
      const s = publishableState();
      const patched = patchComponentDraft(s, "k-dal", { isRequired: false });
      expect(patched.components[0]!.isRequired).toBe(false);
      expect(patched.components[1]!.isRequired).toBe(true);
      // The other fields of the patched component survive the merge.
      expect(patched.components[0]!.defaultCatalogItemId).toBe(
        rajma.catalogItemId,
      );
    });
  });

  describe("changeComponentDefault", () => {
    it("re-points the default, re-derives the group, and clears swaps", () => {
      const s = publishableState();
      // k-dal defaults to Rajma with a Chana swap; switch it to Roti (a bread).
      const changed = changeComponentDefault(s, "k-dal", roti.catalogItemId, [
        rajma,
        chana,
        roti,
      ]);
      expect(changed.components[0]!.defaultCatalogItemId).toBe(
        roti.catalogItemId,
      );
      expect(changed.components[0]!.componentGroup).toBe("bread");
      expect(changed.components[0]!.alternativeCatalogItemIds).toEqual([]);
    });

    it("returns the state unchanged for an id not in the catalog", () => {
      const s = publishableState();
      expect(changeComponentDefault(s, "k-dal", "ghost-id", catalog)).toBe(s);
    });
  });

  describe("toggleComponentAlternative", () => {
    it("adds an absent alternative and removes a present one", () => {
      const base = {
        ...emptyMenuBuilderState("2026-06-15", FUTURE_CUTOFF),
        components: [makeComponentDraft(rajma, "k-dal")],
      };
      const added = toggleComponentAlternative(
        base,
        "k-dal",
        chana.catalogItemId,
      );
      expect(added.components[0]!.alternativeCatalogItemIds).toEqual([
        chana.catalogItemId,
      ]);
      const removed = toggleComponentAlternative(
        added,
        "k-dal",
        chana.catalogItemId,
      );
      expect(removed.components[0]!.alternativeCatalogItemIds).toEqual([]);
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

describe("menuBuilderStateFromMenuDay (edit builder load)", () => {
  it("loads a day's date/cutoff/note and its components keyed by component id", () => {
    const s = menuBuilderStateFromMenuDay(f.publishedMenuDay);
    expect(s.menuDate).toBe(f.publishedMenuDay.menuDate);
    expect(s.cutoffAt).toBe(f.publishedMenuDay.cutoffAt);
    expect(s.note).toBe(f.publishedMenuDay.note);
    expect(s.components.map((c) => c.key)).toEqual(
      f.publishedMenuDay.components.map((c) => c.menuComponentId),
    );
    const dal = s.components[0]!;
    expect(dal.defaultCatalogItemId).toBe(
      f.publishedMenuDay.components[0]!.defaultCatalogItemId,
    );
    expect(dal.isRequired).toBe(true);
    // Alternatives carry forward as their catalog ids (the swap picker's value).
    expect(dal.alternativeCatalogItemIds).toEqual(
      f.publishedMenuDay.components[0]!.alternatives.map(
        (a) => a.catalogItemId,
      ),
    );
  });

  it("carries customization groups forward LOSSLESSLY, incl. option canonicalUnit", () => {
    const s = menuBuilderStateFromMenuDay(f.publishedMenuDay);
    const group = s.components[0]!.customizationGroups[0]!;
    const src = f.publishedMenuDay.components[0]!.customizationGroups[0]!;
    expect(group).toEqual({
      name: src.name,
      customizationType: src.customizationType,
      includedInPrice: src.includedInPrice,
      isRequired: src.isRequired,
      minimumSelections: src.minimumSelections,
      maximumSelections: src.maximumSelections,
      options: [
        {
          code: src.options[0]!.code,
          label: src.options[0]!.label,
          quantityDelta: src.options[0]!.quantityDelta,
          canonicalUnit: src.options[0]!.canonicalUnit,
          externalPriceLabel: src.options[0]!.externalPriceLabel,
          minimumQuantity: src.options[0]!.minimumQuantity,
          maximumQuantity: src.options[0]!.maximumQuantity,
        },
      ],
    });
    // The carried-forward unit is the real value, not dropped to null.
    expect(group.options[0]!.canonicalUnit).toBe("oz");
  });

  it("orders components by sortOrder so the rebuilt tree matches what the owner sees", () => {
    const shuffled = {
      ...f.publishedMenuDay,
      components: [...f.publishedMenuDay.components].reverse(),
    };
    const s = menuBuilderStateFromMenuDay(shuffled);
    expect(s.components.map((c) => c.key)).toEqual(
      [...f.publishedMenuDay.components]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => c.menuComponentId),
    );
  });
});

describe("menuBuilderStateToEditInput", () => {
  it("is the create input minus the immutable menuDate, with the note trimmed", () => {
    const state: MenuBuilderState = {
      ...publishableState(),
      note: "  Holiday menu  ",
    };
    const edit = menuBuilderStateToEditInput(state);
    expect("menuDate" in edit).toBe(false);
    expect(edit.cutoffAt).toBe(state.cutoffAt);
    expect(edit.note).toBe("Holiday menu");
    expect(edit.components).toHaveLength(2);
    expect(edit.components[0]!.defaultCatalogItemId).toBe(rajma.catalogItemId);
    expect(edit.components[0]!.alternativeCatalogItemIds).toEqual([
      chana.catalogItemId,
    ]);
  });

  it("round-trips a loaded day back to an equivalent edit payload", () => {
    const state = menuBuilderStateFromMenuDay(f.publishedMenuDay);
    const edit = menuBuilderStateToEditInput(state);
    expect(edit.cutoffAt).toBe(f.publishedMenuDay.cutoffAt);
    expect(edit.components).toHaveLength(f.publishedMenuDay.components.length);
    // Customizations survive the full load→save round-trip.
    expect(edit.components[0]!.customizationGroups).toEqual(
      state.components[0]!.customizationGroups,
    );
  });

  it("empties the note to null when blank", () => {
    expect(
      menuBuilderStateToEditInput({ ...publishableState(), note: "   " }).note,
    ).toBeNull();
  });
});

describe("isMenuDayEditable (edit affordance gate)", () => {
  const day = f.publishedMenuDay; // published, cutoff 2026-06-11T14:30Z
  const beforeCutoff = Date.parse("2026-06-11T10:00:00Z");
  const afterCutoff = Date.parse("2026-06-12T00:00:00Z");

  it("a published day is editable before its cutoff", () => {
    expect(isMenuDayEditable(day, beforeCutoff)).toBe(true);
  });

  it("a published day past its cutoff is NOT editable", () => {
    expect(isMenuDayEditable(day, afterCutoff)).toBe(false);
  });

  it("a draft day is editable even with a past cutoff (the owner fixes it)", () => {
    const draft = { ...day, status: "draft" as const };
    expect(isMenuDayEditable(draft, afterCutoff)).toBe(true);
  });

  it("locked / superseded / terminal days are never editable", () => {
    expect(
      isMenuDayEditable(
        { ...day, lockedAt: "2026-06-11T14:30:00Z" },
        beforeCutoff,
      ),
    ).toBe(false);
    expect(
      isMenuDayEditable(
        { ...day, supersededAt: "2026-06-11T12:00:00Z" },
        beforeCutoff,
      ),
    ).toBe(false);
    expect(
      isMenuDayEditable({ ...day, status: "cancelled" }, beforeCutoff),
    ).toBe(false);
    expect(
      isMenuDayEditable({ ...day, status: "archived" }, beforeCutoff),
    ).toBe(false);
    expect(isMenuDayEditable({ ...day, status: "locked" }, beforeCutoff)).toBe(
      false,
    );
  });
});

describe("editCatalog (archived-selection visibility on edit)", () => {
  it("returns the active catalog unchanged when the day references only active items", () => {
    const result = editCatalog(f.catalogItems, f.publishedMenuDay);
    expect(result).toHaveLength(f.catalogItems.length);
    expect(result.every((item) => item.isActive)).toBe(true);
  });

  it("reconstructs an archived DEFAULT + ALTERNATIVE the day still references, flagged inactive", () => {
    // Rajma (the dal default) and Chana (its alternative) are no longer in the active
    // catalog — simulating an archive after the day was authored.
    const active = f.catalogItems.filter(
      (item) => item.name !== "Rajma" && item.name !== "Chana Masala",
    );
    const result = editCatalog(active, f.publishedMenuDay);

    const rajmaItem = result.find(
      (item) => item.catalogItemId === rajma.catalogItemId,
    )!;
    expect(rajmaItem).toMatchObject({
      name: "Rajma",
      componentGroup: "dal_or_legume",
      canonicalUnit: "oz",
      defaultQuantity: 16,
      isActive: false,
      supportsSpiceLevel: true,
      supportsSaltLevel: true,
    });
    const chanaItem = result.find(
      (item) => item.catalogItemId === chana.catalogItemId,
    )!;
    expect(chanaItem).toMatchObject({
      name: "Chana Masala",
      componentGroup: "dal_or_legume",
      canonicalUnit: "oz",
      defaultQuantity: 16,
      isActive: false,
    });
    // Active items are kept; only the two missing ones are synthesized.
    expect(result).toHaveLength(active.length + 2);
  });
});

describe("alternativeChoices (edit-aware swap picker)", () => {
  const dalDraft: MenuComponentDraft = {
    key: "k-dal",
    componentGroup: "dal_or_legume",
    defaultCatalogItemId: rajma.catalogItemId,
    isRequired: true,
    alternativeCatalogItemIds: [chana.catalogItemId],
    customizationGroups: [],
  };

  it("offers active same-group items other than the default (== eligibleAlternatives for a fresh draft)", () => {
    const alts = alternativeChoices(dalDraft, f.catalogItems);
    expect(alts.map((a) => a.name)).toEqual(["Chana Masala"]);
  });

  it("still offers a SELECTED alternative that has since been archived (so it can be unchecked)", () => {
    const catalog = f.catalogItems.map((item) =>
      item.catalogItemId === chana.catalogItemId
        ? { ...item, isActive: false }
        : item,
    );
    const alts = alternativeChoices(dalDraft, catalog);
    expect(alts.map((a) => a.catalogItemId)).toContain(chana.catalogItemId);
  });

  it("hides an archived item that is NOT currently selected", () => {
    const catalog = f.catalogItems.map((item) =>
      item.catalogItemId === chana.catalogItemId
        ? { ...item, isActive: false }
        : item,
    );
    const draftNoAlt = { ...dalDraft, alternativeCatalogItemIds: [] };
    expect(alternativeChoices(draftNoAlt, catalog)).toHaveLength(0);
  });
});

describe("hasUnavailableSelection (archived-ref save gate)", () => {
  it("is false when every selected default/alternative is active", () => {
    const state = menuBuilderStateFromMenuDay(f.publishedMenuDay);
    expect(hasUnavailableSelection(state, f.catalogItems)).toBe(false);
  });

  it("is true when a default references an archived item", () => {
    const state = menuBuilderStateFromMenuDay(f.publishedMenuDay);
    const active = f.catalogItems.filter((item) => item.name !== "Rajma");
    expect(hasUnavailableSelection(state, active)).toBe(true);
  });

  it("is true when an alternative references an archived item", () => {
    const state = menuBuilderStateFromMenuDay(f.publishedMenuDay);
    const active = f.catalogItems.filter(
      (item) => item.name !== "Chana Masala",
    );
    expect(hasUnavailableSelection(state, active)).toBe(true);
  });

  it("ignores an empty (unfilled) default slot", () => {
    const state: MenuBuilderState = {
      ...emptyMenuBuilderState("2026-06-15", FUTURE_CUTOFF),
      components: [
        {
          key: "k-empty",
          componentGroup: "sabzi",
          defaultCatalogItemId: "",
          isRequired: false,
          alternativeCatalogItemIds: [],
          customizationGroups: [],
        },
      ],
    };
    expect(hasUnavailableSelection(state, f.catalogItems)).toBe(false);
  });
});

describe("defaultCutoffLocalIso (fresh-create cutoff, minute-truncated)", () => {
  it("displays the same minute as the raw default but stores no sub-minute remainder", () => {
    // A 'now' carrying seconds + millis: the raw ISO keeps them, the local one drops them.
    const now = new Date("2026-06-15T09:12:43.123Z");
    const truncated = defaultCutoffLocalIso(now);
    // Same wall-clock minute the input shows…
    expect(isoToLocalDateTime(truncated)).toBe(
      isoToLocalDateTime(defaultCutoffIso(now)),
    );
    // …but stored on a whole-minute boundary (no stray seconds to silently persist).
    expect(Date.parse(truncated) % 60_000).toBe(0);
  });
});

describe("MENU_REVISION_WARNING (shared copy)", () => {
  it("is the single re-confirm consequence sentence used by web + mobile", () => {
    expect(MENU_REVISION_WARNING).toMatch(/revision/i);
    expect(MENU_REVISION_WARNING).toMatch(/re-confirm/i);
  });
});

// ─────────────────────── Customization-group authoring ───────────────────────

/** A one-component builder state (a dal slot) the customization reducers target. */
function oneComponentState(): MenuBuilderState {
  return {
    menuDate: "2026-06-15",
    cutoffAt: FUTURE_CUTOFF,
    note: "",
    components: [makeComponentDraft(rajma, "k-dal")],
  };
}

const KEY = "k-dal";

describe("normalizeCustomizationGroup (type-driven bounds)", () => {
  it("forces a single selection for single_select and boolean", () => {
    expect(
      normalizeCustomizationGroup(makeCustomizationGroup("single_select"))
        .maximumSelections,
    ).toBe(1);
    expect(
      normalizeCustomizationGroup(makeCustomizationGroup("boolean"))
        .maximumSelections,
    ).toBe(1);
  });

  it("defaults a quantity_increment to a finite cap (never unbounded)", () => {
    expect(makeCustomizationGroup("quantity_increment").maximumSelections).toBe(
      1,
    );
  });

  it("clears selection counts for a free-text note", () => {
    const g = normalizeCustomizationGroup({
      ...makeCustomizationGroup("text_note"),
      minimumSelections: 3,
      maximumSelections: 5,
    });
    expect(g.minimumSelections).toBe(0);
    expect(g.maximumSelections).toBeNull();
  });

  it("bumps a required choice group's minimum to at least one", () => {
    const g = normalizeCustomizationGroup({
      ...makeCustomizationGroup("multi_select"),
      isRequired: true,
      maximumSelections: 3,
    });
    expect(g.minimumSelections).toBe(1);
  });

  it("does NOT force a minimum on a required boolean / text_note", () => {
    expect(
      normalizeCustomizationGroup({
        ...makeCustomizationGroup("boolean"),
        isRequired: true,
      }).minimumSelections,
    ).toBe(0);
  });

  it("clamps the minimum down to never exceed a finite maximum", () => {
    const g = normalizeCustomizationGroup({
      ...makeCustomizationGroup("multi_select"),
      minimumSelections: 5,
      maximumSelections: 2,
    });
    expect(g.minimumSelections).toBe(2);
  });
});

describe("nextOptionCode / makeCustomizationOption", () => {
  it("mints a unique opt_<n> code skipping ones already used", () => {
    expect(nextOptionCode([])).toBe("opt_1");
    expect(nextOptionCode([{ code: "opt_1" }])).toBe("opt_2");
    // length+1 collides with an existing custom code → skip past it.
    expect(nextOptionCode([{ code: "mint" }, { code: "opt_3" }])).toBe("opt_4");
  });

  it("creates an option with an auto code and a blank label to fill", () => {
    const opt = makeCustomizationOption([{ code: "opt_1" }]);
    expect(opt.code).toBe("opt_2");
    expect(opt.label).toBe("");
    expect(opt.quantityDelta).toBeNull();
  });
});

describe("customization group reducers (add / remove / change type)", () => {
  it("adds a group to the targeted component only", () => {
    const next = addCustomizationGroup(
      oneComponentState(),
      KEY,
      "single_select",
    );
    expect(next.components[0]!.customizationGroups).toHaveLength(1);
    expect(next.components[0]!.customizationGroups[0]!.customizationType).toBe(
      "single_select",
    );
    // A missing component key is a no-op.
    expect(
      addCustomizationGroup(oneComponentState(), "nope").components[0]!
        .customizationGroups,
    ).toHaveLength(0);
  });

  it("removes the group at the given index", () => {
    let s = addCustomizationGroup(oneComponentState(), KEY, "single_select");
    s = addCustomizationGroup(s, KEY, "multi_select");
    s = removeCustomizationGroup(s, KEY, 0);
    expect(s.components[0]!.customizationGroups).toHaveLength(1);
    expect(s.components[0]!.customizationGroups[0]!.customizationType).toBe(
      "multi_select",
    );
  });

  it("re-normalizes bounds when the type changes (multi → single forces max 1)", () => {
    let s = addCustomizationGroup(oneComponentState(), KEY, "multi_select");
    s = patchCustomizationGroup(s, KEY, 0, { maximumSelections: 4 });
    s = changeCustomizationType(s, KEY, 0, "single_select");
    expect(s.components[0]!.customizationGroups[0]!.maximumSelections).toBe(1);
    expect(s.components[0]!.customizationGroups[0]!.customizationType).toBe(
      "single_select",
    );
  });

  it("patchCustomizationGroup re-normalizes (toggling required bumps the minimum)", () => {
    let s = addCustomizationGroup(oneComponentState(), KEY, "multi_select");
    s = patchCustomizationGroup(s, KEY, 0, {
      maximumSelections: 3,
      isRequired: true,
    });
    expect(s.components[0]!.customizationGroups[0]!.minimumSelections).toBe(1);
  });
});

describe("customization option reducers (add / remove / patch)", () => {
  it("adds and patches an option in place", () => {
    let s = addCustomizationGroup(oneComponentState(), KEY, "single_select");
    s = addCustomizationOption(s, KEY, 0);
    s = patchCustomizationOption(s, KEY, 0, 0, { label: "Mint chutney" });
    const opt = s.components[0]!.customizationGroups[0]!.options[0]!;
    expect(opt.label).toBe("Mint chutney");
    expect(opt.code).toBe("opt_1");
  });

  it("removes the option at the given index", () => {
    let s = addCustomizationGroup(oneComponentState(), KEY, "multi_select");
    s = addCustomizationOption(s, KEY, 0);
    s = addCustomizationOption(s, KEY, 0);
    s = removeCustomizationOption(s, KEY, 0, 0);
    expect(s.components[0]!.customizationGroups[0]!.options).toHaveLength(1);
    // The second-added option (code opt_2) is the survivor.
    expect(s.components[0]!.customizationGroups[0]!.options[0]!.code).toBe(
      "opt_2",
    );
  });
});

describe("customizationInsertIssues (mirrors the pmp_4 DB CHECKs)", () => {
  /** A well-formed single-select group with one named option — should be insertable. */
  function validState(): MenuBuilderState {
    let s = addCustomizationGroup(oneComponentState(), KEY, "single_select");
    s = patchCustomizationGroup(s, KEY, 0, { name: "Sauce" });
    s = addCustomizationOption(s, KEY, 0);
    s = patchCustomizationOption(s, KEY, 0, 0, { label: "Mint chutney" });
    return s;
  }

  it("is empty for a well-formed group", () => {
    expect(customizationInsertIssues(validState())).toEqual([]);
  });

  it("flags a blank group name", () => {
    const s = patchCustomizationGroup(validState(), KEY, 0, { name: "  " });
    expect(customizationInsertIssues(s).join(" ")).toMatch(/needs a name/i);
  });

  it("flags a blank option label", () => {
    const s = patchCustomizationOption(validState(), KEY, 0, 0, { label: "" });
    expect(customizationInsertIssues(s).join(" ")).toMatch(/needs a label/i);
  });

  it("flags duplicate option codes within a group", () => {
    let s = addCustomizationOption(validState(), KEY, 0);
    s = patchCustomizationOption(s, KEY, 0, 1, {
      code: "opt_1",
      label: "Dup",
    });
    expect(customizationInsertIssues(s).join(" ")).toMatch(/unique/i);
  });

  it("flags a quantity add-on with no group/option maximum", () => {
    // Build a quantity_increment but strip the auto cap to simulate a cleared field.
    let s = addCustomizationGroup(
      oneComponentState(),
      KEY,
      "quantity_increment",
    );
    s = patchCustomizationGroup(s, KEY, 0, {
      name: "Extra roti",
      maximumSelections: null,
    });
    s = addCustomizationOption(s, KEY, 0);
    s = patchCustomizationOption(s, KEY, 0, 0, { label: "One more" });
    const issues = customizationInsertIssues(s).join(" ");
    expect(issues).toMatch(/maximum/i);
  });

  it("flags a required choice group with no options", () => {
    let s = addCustomizationGroup(oneComponentState(), KEY, "multi_select");
    s = patchCustomizationGroup(s, KEY, 0, {
      name: "Pickles",
      isRequired: true,
    });
    expect(customizationInsertIssues(s).join(" ")).toMatch(
      /at least one option/i,
    );
  });

  it("flags an option whose max quantity is below its min", () => {
    let s = addCustomizationGroup(
      oneComponentState(),
      KEY,
      "quantity_increment",
    );
    s = patchCustomizationGroup(s, KEY, 0, { name: "Extra" });
    s = addCustomizationOption(s, KEY, 0);
    s = patchCustomizationOption(s, KEY, 0, 0, {
      label: "More",
      minimumQuantity: 5,
      maximumQuantity: 2,
    });
    expect(customizationInsertIssues(s).join(" ")).toMatch(
      /maximum quantity can't be smaller/i,
    );
  });
});

describe("customization round-trip (create input + preview)", () => {
  /** A publishable state with a single-select sauce on the dal component. */
  function withSauce(): MenuBuilderState {
    let s = publishableState();
    s = addCustomizationGroup(s, "k-dal", "single_select");
    s = patchCustomizationGroup(s, "k-dal", 0, { name: "Sauce" });
    s = addCustomizationOption(s, "k-dal", 0);
    s = patchCustomizationOption(s, "k-dal", 0, 0, {
      code: "mint",
      label: "Mint chutney",
      externalPriceLabel: "+$1",
    });
    return s;
  }

  it("carries the group + option through menuBuilderStateToCreateInput", () => {
    const input = menuBuilderStateToCreateInput(withSauce());
    const group = input.components[0]!.customizationGroups![0]!;
    expect(group.name).toBe("Sauce");
    expect(group.customizationType).toBe("single_select");
    expect(group.maximumSelections).toBe(1);
    expect(group.options[0]).toMatchObject({
      code: "mint",
      label: "Mint chutney",
      externalPriceLabel: "+$1",
    });
  });

  it("previews the group so the completeness validator sees it, staying publishable", () => {
    const preview = previewMenuDayFromBuilder(withSauce(), f.catalogItems);
    expect(preview.components[0]!.customizationGroups).toHaveLength(1);
    expect(preview.components[0]!.customizationGroups[0]!.name).toBe("Sauce");
    // A well-formed single_select sauce doesn't break publishability.
    expect(isMenuBuilderPublishable(withSauce(), f.catalogItems, NOW)).toBe(
      true,
    );
    expect(customizationInsertIssues(withSauce())).toEqual([]);
  });
});
