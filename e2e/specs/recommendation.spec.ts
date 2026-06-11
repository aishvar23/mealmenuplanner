import { expect, test } from "../fixtures/auth";
import { signInWithPassword } from "../helpers/auth";
import { completeMinimumOnboarding } from "../helpers/onboarding";
import {
  featuredTitle,
  generateFeatured,
  heroText,
  LAND_SEA_MEAT,
  MEAT_OR_EGG,
  openReplacePicker,
  pickerCandidateNames,
} from "../helpers/today";

/**
 * RECO — the deterministic, UI-observable parts of the recommendation engine:
 * diet hard filters and rejection re-suggestion. Soft-scoring details (cooking
 * time, variety gap, popularity, frequency) are covered by the engine's unit
 * tests and/or require seed/time control not exposed via the UI — those are
 * represented as fixmes below.
 *
 * The diet hard filter is exercised against the whole slot candidate set: the
 * "Try another" picker (BUG-022/023) lists every slot-eligible dish from the
 * same recommender filters, so asserting none of them is meat/egg is a stronger
 * check than re-rolling the single featured pick.
 */

test("RECO-001: vegetarian household never gets a meat or egg dish", async ({
  page,
  onboardedHousehold,
}) => {
  expect(onboardedHousehold.householdId).toBeTruthy();
  await page.goto("/today");
  await generateFeatured(page);

  // The featured suggestion respects the diet hard filter.
  const featured = await featuredTitle(page);
  expect(featured.length).toBeGreaterThan(0);
  expect(featured).not.toMatch(/^plan /i);
  expect(featured, `vegetarian featured was "${featured}"`).not.toMatch(
    MEAT_OR_EGG,
  );

  // And so does every candidate the slot picker offers.
  const dialog = await openReplacePicker(page);
  const names = await pickerCandidateNames(dialog);
  expect(names.length).toBeGreaterThan(0);
  for (const name of names) {
    expect(name, `vegetarian candidate was "${name}"`).not.toMatch(MEAT_OR_EGG);
  }
});

test("RECO-002: eggetarian household never gets land/sea meat", async ({
  page,
  freshUser,
}) => {
  await signInWithPassword(page, freshUser.email, freshUser.password);
  await page.waitForURL("**/onboarding", { timeout: 30_000 });
  await completeMinimumOnboarding(page, {
    householdName: "Eggetarian House",
    diet: "Eggetarian",
  });
  await page.goto("/today");
  await generateFeatured(page);

  // Egg is allowed; chicken/fish/mutton/etc. are still hard-filtered out — both
  // for the featured pick and for every candidate in the picker.
  const featured = await featuredTitle(page);
  expect(featured, `eggetarian featured was "${featured}"`).not.toMatch(
    LAND_SEA_MEAT,
  );
  const dialog = await openReplacePicker(page);
  const names = await pickerCandidateNames(dialog);
  expect(names.length).toBeGreaterThan(0);
  for (const name of names) {
    expect(name, `eggetarian candidate was "${name}"`).not.toMatch(
      LAND_SEA_MEAT,
    );
  }
});

test("RECO-005: rejecting a suggestion re-suggests a different dish", async ({
  page,
  onboardedHousehold,
}) => {
  expect(onboardedHousehold.householdId).toBeTruthy();
  await page.goto("/today");
  await generateFeatured(page);
  const rejected = await featuredTitle(page);

  await page
    .getByRole("button", { name: /reject with feedback/i })
    .first()
    .click();
  await page.getByRole("button", { name: "Don't suggest again" }).click();

  // Rejecting surfaces "Quick swaps" — alternatives that exclude the rejected
  // dish. Choosing the first one re-features a different dish.
  await expect(page.getByText("Quick swaps")).toBeVisible({ timeout: 15_000 });
  const choose = page.getByRole("button", { name: "Choose" }).first();
  await expect(choose).toBeVisible();
  await choose.click();
  await expect
    .poll(() => heroText(page), { timeout: 20_000 })
    .not.toBe(rejected);
});

// The following need deterministic seed/time/state control the UI doesn't expose
// (the engine's scoring is covered by lib/recommendation/*.test.ts unit tests):
test.fixme("RECO-003: cooking time is respected (needs per-dish time introspection)", async () => {});
test.fixme("RECO-004: recently-cooked dish not repeated within variety gap (needs cooked history setup)", async () => {});
test.fixme("RECO-006: eating-out does not count as cooked (needs rotation-history assertion)", async () => {});
test.fixme("RECO-007: allergy is a hard filter (needs allergy onboarding + ingredient introspection)", async () => {});
test.fixme("RECO-008: preferred dishes do not override hard filters (needs cross-diet preferred-dish setup)", async () => {});
test.fixme("RECO-009: prep-required dish not suggested when prep impossible (needs time-of-day control)", async () => {});
test.fixme("RECO-010: future prep-required dish creates a prep reminder (needs deterministic soak-dish pick)", async () => {});
test.fixme("RECO-011: popular meal combinations rank higher (meal-combination catalog not wired into the app)", async () => {});
test.fixme("RECO-012: frequency preferences affect weekly distribution (frequency tags not implemented)", async () => {});
