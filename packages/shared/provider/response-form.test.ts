import { describe, expect, it } from "vitest";

import * as fx from "./fixtures";
import type { MemberResponseDto, MenuDayDto } from "./dtos";
import {
  componentChoices,
  cutoffRemainingMs,
  formatCountdown,
  initialFormState,
  isCutoffPassed,
  isOptionSelected,
  isResponseLocked,
  isResponseReadOnly,
  optionQuantity,
  selectChoice,
  selectSingle,
  setIncrement,
  setSaltLevel,
  setSpiceLevel,
  toggleMulti,
  toSaveRequest,
} from "./response-form";

const menu = fx.publishedMenuDay;
const dal = menu.components[0]!; // dal_or_legume: default rajma, alt chana, increment group
const bread = menu.components[1]!; // bread: no alternatives/customizations
const incrementGroup = dal.customizationGroups[0]!;
const incrementOption = incrementGroup.options[0]!;

/** A baseline "no response yet" shape for `menu`. */
const noResponse: MemberResponseDto = {
  responseId: null,
  menuDayId: menu.menuDayId,
  status: "no_response",
  version: 0,
  memberNote: null,
  items: [],
  lockedAt: null,
};

describe("componentChoices", () => {
  it("lists the default first, then active alternatives", () => {
    const choices = componentChoices(dal);
    expect(choices).toHaveLength(2);
    expect(choices[0]).toMatchObject({
      catalogItemId: dal.defaultCatalogItemId,
      // Denormalized dish name carried onto each choice (ADO #39).
      itemName: dal.defaultItemName,
      isDefault: true,
    });
    expect(choices[1]).toMatchObject({
      catalogItemId: dal.alternatives[0]!.catalogItemId,
      itemName: dal.alternatives[0]!.itemName,
      isDefault: false,
    });
  });

  it("returns just the default when there are no alternatives", () => {
    expect(componentChoices(bread)).toHaveLength(1);
  });
});

describe("initialFormState", () => {
  it("starts every component on its default package when unanswered", () => {
    const state = initialFormState(menu, noResponse);
    for (const c of menu.components) {
      expect(state[c.menuComponentId]).toMatchObject({
        selectedCatalogItemId: c.defaultCatalogItemId,
        quantity: c.defaultQuantity,
        canonicalUnit: c.canonicalUnit,
        spiceLevel: null,
        saltLevel: null,
        customizations: [],
      });
    }
  });

  it("prefills from an existing response (alternative, spice/salt, customization)", () => {
    const state = initialFormState(menu, fx.confirmedResponse);
    const dalSel = state[dal.menuComponentId]!;
    expect(dalSel.selectedCatalogItemId).toBe(
      fx.confirmedResponse.items[0]!.selectedCatalogItemId,
    );
    expect(dalSel.spiceLevel).toBe("spicy");
    expect(dalSel.saltLevel).toBe("low_salt");
    expect(dalSel.customizations).toEqual([
      { optionId: incrementOption.optionId, quantity: 1 },
    ]);
  });

  it("falls back to the default for a component the response omits", () => {
    // confirmedResponse has no item for the rice component.
    const rice = menu.components[2]!;
    const state = initialFormState(menu, fx.confirmedResponse);
    expect(state[rice.menuComponentId]!.selectedCatalogItemId).toBe(
      rice.defaultCatalogItemId,
    );
  });
});

describe("selectChoice", () => {
  it("swaps to an alternative, carrying its quantity/unit and keeping spice/salt", () => {
    let state = initialFormState(menu, noResponse);
    state = setSpiceLevel(state, dal.menuComponentId, "mild");
    const alt = dal.alternatives[0]!;
    state = selectChoice(state, dal, alt.catalogItemId);
    expect(state[dal.menuComponentId]!).toMatchObject({
      selectedCatalogItemId: alt.catalogItemId,
      quantity: alt.quantity,
      canonicalUnit: alt.canonicalUnit,
      spiceLevel: "mild",
    });
  });

  it("does not mutate the input state (immutability)", () => {
    const state = initialFormState(menu, noResponse);
    const before = state[dal.menuComponentId]!;
    selectChoice(state, dal, dal.alternatives[0]!.catalogItemId);
    expect(state[dal.menuComponentId]!).toBe(before);
  });
});

describe("spice / salt setters", () => {
  it("sets and clears spice and salt", () => {
    let state = initialFormState(menu, noResponse);
    state = setSpiceLevel(state, dal.menuComponentId, "spicy");
    state = setSaltLevel(state, dal.menuComponentId, "high_salt");
    expect(state[dal.menuComponentId]!.spiceLevel).toBe("spicy");
    expect(state[dal.menuComponentId]!.saltLevel).toBe("high_salt");
    state = setSpiceLevel(state, dal.menuComponentId, null);
    expect(state[dal.menuComponentId]!.spiceLevel).toBeNull();
  });
});

describe("customization selection", () => {
  const optionIds = [incrementOption.optionId];

  it("single-select picks one and toggles off on re-pick", () => {
    let state = initialFormState(menu, noResponse);
    state = selectSingle(
      state,
      dal.menuComponentId,
      optionIds,
      incrementOption.optionId,
    );
    expect(
      isOptionSelected(state, dal.menuComponentId, incrementOption.optionId),
    ).toBe(true);
    state = selectSingle(
      state,
      dal.menuComponentId,
      optionIds,
      incrementOption.optionId,
    );
    expect(
      isOptionSelected(state, dal.menuComponentId, incrementOption.optionId),
    ).toBe(false);
  });

  it("multi-select caps at the group maximum", () => {
    let state = initialFormState(menu, noResponse);
    state = toggleMulti(
      state,
      dal.menuComponentId,
      optionIds,
      incrementOption.optionId,
      1,
    );
    expect(
      isOptionSelected(state, dal.menuComponentId, incrementOption.optionId),
    ).toBe(true);
    // A second distinct option would exceed max=1 — but there's only one option,
    // so re-toggling the same one removes it.
    state = toggleMulti(
      state,
      dal.menuComponentId,
      optionIds,
      incrementOption.optionId,
      1,
    );
    expect(
      isOptionSelected(state, dal.menuComponentId, incrementOption.optionId),
    ).toBe(false);
  });

  it("multi-select ignores a toggle that would exceed the cap", () => {
    const twoOptionIds = ["opt-a", "opt-b"];
    let state = initialFormState(menu, noResponse);
    state = toggleMulti(state, dal.menuComponentId, twoOptionIds, "opt-a", 1);
    const before = state;
    state = toggleMulti(state, dal.menuComponentId, twoOptionIds, "opt-b", 1);
    expect(state).toBe(before); // no-op at cap
  });

  it("quantity-increment sets a count and removes at zero", () => {
    let state = initialFormState(menu, noResponse);
    state = setIncrement(
      state,
      dal.menuComponentId,
      incrementOption.optionId,
      2,
    );
    expect(
      optionQuantity(state, dal.menuComponentId, incrementOption.optionId),
    ).toBe(2);
    state = setIncrement(
      state,
      dal.menuComponentId,
      incrementOption.optionId,
      0,
    );
    expect(
      optionQuantity(state, dal.menuComponentId, incrementOption.optionId),
    ).toBe(0);
    expect(state[dal.menuComponentId]!.customizations).toEqual([]);
  });
});

describe("toSaveRequest", () => {
  it("emits items in menu-component order with the contract field names", () => {
    let state = initialFormState(menu, noResponse);
    state = selectChoice(state, dal, dal.alternatives[0]!.catalogItemId);
    state = setIncrement(
      state,
      dal.menuComponentId,
      incrementOption.optionId,
      1,
    );
    const body = toSaveRequest(menu, state, 3, "  Less oil  ");
    expect(body.expectedVersion).toBe(3);
    expect(body.memberNote).toBe("Less oil"); // trimmed
    expect(body.items.map((i) => i.menuComponentId)).toEqual(
      menu.components.map((c) => c.menuComponentId),
    );
    const dalItem = body.items[0]!;
    expect(dalItem.selectedCatalogItemId).toBe(
      dal.alternatives[0]!.catalogItemId,
    );
    expect(dalItem.customizations).toEqual([
      { customizationOptionId: incrementOption.optionId, quantity: 1 },
    ]);
  });

  it("maps a blank member note to null", () => {
    const state = initialFormState(menu, noResponse);
    expect(toSaveRequest(menu, state, 0, "   ").memberNote).toBeNull();
    expect(toSaveRequest(menu, state, 0, null).memberNote).toBeNull();
  });
});

describe("lock state", () => {
  it("an open published menu with a draft is editable", () => {
    expect(isResponseLocked(menu, fx.draftResponse)).toBe(false);
  });

  it("is locked when the response is locked", () => {
    expect(isResponseLocked(menu, fx.lockedResponse)).toBe(true);
  });

  it("is locked when the menu status is locked", () => {
    const lockedMenu: MenuDayDto = { ...menu, status: "locked" };
    expect(isResponseLocked(lockedMenu, fx.draftResponse)).toBe(true);
  });

  it("is locked for an auto-accepted response", () => {
    expect(isResponseLocked(menu, fx.autoAcceptedResponse)).toBe(true);
  });
});

describe("isResponseReadOnly", () => {
  const before = new Date("2026-06-11T10:00:00Z");
  const after = new Date("2026-06-11T15:00:00Z");

  it("is editable for an open draft before the cutoff", () => {
    expect(isResponseReadOnly(menu, fx.draftResponse, before)).toBe(false);
  });

  it("is read-only once the cutoff has passed, even if not yet locked by state", () => {
    expect(isResponseLocked(menu, fx.draftResponse)).toBe(false);
    expect(isResponseReadOnly(menu, fx.draftResponse, after)).toBe(true);
  });

  it("is read-only for a locked response regardless of the clock", () => {
    expect(isResponseReadOnly(menu, fx.lockedResponse, before)).toBe(true);
  });
});

describe("cutoff helpers", () => {
  const before = new Date("2026-06-11T10:00:00Z");
  const after = new Date("2026-06-11T15:00:00Z");

  it("detects cutoff passing", () => {
    expect(isCutoffPassed(menu, before)).toBe(false);
    expect(isCutoffPassed(menu, after)).toBe(true);
  });

  it("computes non-negative remaining time", () => {
    expect(cutoffRemainingMs(menu, before)).toBeGreaterThan(0);
    expect(cutoffRemainingMs(menu, after)).toBe(0);
  });

  it("formats the countdown across scales", () => {
    expect(formatCountdown(0)).toBe("Closed");
    expect(formatCountdown(30 * 1000)).toBe("30s");
    expect(formatCountdown(90 * 1000)).toBe("1m 30s");
    expect(formatCountdown((3 * 3600 + 12 * 60) * 1000)).toBe("3h 12m");
    expect(formatCountdown((2 * 86400 + 3 * 3600) * 1000)).toBe("2d 3h");
  });
});
