import { expect, test } from "../fixtures/auth";
import { signInWithPassword } from "../helpers/auth";
import { completeMinimumOnboarding } from "../helpers/onboarding";
import {
  featuredTitle,
  generateFeatured,
  LAND_SEA_MEAT,
  MEAT_OR_EGG,
  tryAnother,
} from "../helpers/today";

/**
 * RECO — the deterministic, UI-observable parts of the recommendation engine:
 * diet hard filters and rejection re-suggestion. Soft-scoring details (cooking
 * time, variety gap, popularity, frequency) are covered by the engine's unit
 * tests and/or require seed/time control not exposed via the UI — those are
 * represented as fixmes below.
 */

test("RECO-001: vegetarian household never gets a meat or egg dish", async ({
  page,
  onboardedHousehold,
}) => {
  expect(onboardedHousehold.householdId).toBeTruthy();
  await page.goto("/today");
  await generateFeatured(page);

  // Several re-rolls — every suggestion must stay within the diet hard filter.
  for (let i = 0; i < 4; i++) {
    const name = await featuredTitle(page);
    expect(name.length).toBeGreaterThan(0);
    expect(name).not.toMatch(/^plan /i);
    expect(name, `vegetarian suggestion was "${name}"`).not.toMatch(
      MEAT_OR_EGG,
    );
    await tryAnother(page);
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

  // Egg is allowed; chicken/fish/mutton/etc. are still hard-filtered out.
  for (let i = 0; i < 4; i++) {
    const name = await featuredTitle(page);
    expect(name, `eggetarian suggestion was "${name}"`).not.toMatch(
      LAND_SEA_MEAT,
    );
    await tryAnother(page);
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
  // The slot is marked Rejected and offers alternatives.
  await expect(page.getByText("Rejected").first()).toBeVisible({
    timeout: 15_000,
  });

  // Asking for another now excludes the rejected dish — poll the hero title
  // until it changes away from the rejected one.
  await page.getByRole("button", { name: "Try another" }).first().click();
  await expect
    .poll(
      async () =>
        (
          await page.getByRole("heading", { level: 2 }).first().textContent()
        )?.trim() ?? "",
      { timeout: 20_000 },
    )
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
