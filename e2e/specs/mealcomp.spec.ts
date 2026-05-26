import { expect, test } from "../fixtures/auth";
import { featuredTitle, generateFeatured, tryAnother } from "../helpers/today";

/**
 * MEALCOMP — meal completeness (global criteria 12 & 13). The deterministic,
 * UI-observable guarantee is that the engine never offers a side/condiment as a
 * standalone main. Cases that require forcing a *specific* primary dish (e.g.
 * "Masala Dosa + chutney", "Rajma + rice") aren't selectable via the UI and are
 * represented as fixmes; the packaging logic is covered by
 * lib/services/meal-plan/packaging.test.ts.
 */

// Sides / condiments that must never be a standalone main meal.
const SIDE_OR_CONDIMENT =
  /^(coconut chutney|mint chutney|mango pickle|papad|raita|boondi raita|green salad|jeera aloo)$/i;

test("MEALCOMP-001: a side/condiment is never offered as a standalone main", async ({
  page,
  onboardedHousehold,
}) => {
  expect(onboardedHousehold.householdId).toBeTruthy();
  await page.goto("/today");
  await generateFeatured(page);

  for (let i = 0; i < 6; i++) {
    const name = await featuredTitle(page);
    expect(
      name,
      `"${name}" should not be a standalone side/condiment`,
    ).not.toMatch(SIDE_OR_CONDIMENT);
    await tryAnother(page);
  }
});

test.fixme("MEALCOMP-002: Masala Dosa is recommended with chutney (can't force a specific dish via UI)", async () => {});
test.fixme("MEALCOMP-003: Jeera Aloo is not a complete meal by itself (covered by MEALCOMP-001)", async () => {});
test.fixme("MEALCOMP-004: Rajma is paired with rice/base (can't force a specific dish via UI)", async () => {});
test.fixme("MEALCOMP-005: Dal is paired with roti/rice (can't force a specific dish via UI)", async () => {});
test.fixme("MEALCOMP-006: complete meals may stand alone (can't force a specific dish via UI)", async () => {});
test.fixme("MEALCOMP-007: explore vs meal-decision mode (explore/search mode not built)", async () => {});
test.fixme("MEALCOMP-008: meal-package grocery combines all components (ingredient correlation)", async () => {});
test.fixme("MEALCOMP-009: side dish can be an optional accompaniment (can't force a specific dish)", async () => {});
test.fixme("MEALCOMP-010: admin cannot activate a side as a complete meal (see ADMIN validation)", async () => {});
