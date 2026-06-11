import { expect, test } from "../fixtures/auth";
import { signInWithPassword } from "../helpers/auth";

/**
 * MEALPREF — meal-preference onboarding. As of P10 the app implements all three
 * modes the spec calls for: "Select meal combinations" (popularity-ranked
 * combination cards), "Build your own combination" (dish cards + frequency tier +
 * goes-with), and "Let the system decide". MEALPREF-001 (the three modes) is
 * verified here; the deeper combination-catalog/promotion cases are follow-ups
 * (some also need the combination catalog seeded into cloud dev).
 */

test("MEALPREF-001: all three meal-preference modes are offered and selectable", async ({
  page,
  freshUser,
}) => {
  await signInWithPassword(page, freshUser.email, freshUser.password);
  await page.waitForURL("**/onboarding", { timeout: 30_000 });

  // Step 1 → 2: basics, then diet + cuisine.
  await page.getByLabel("Household name").fill("Pref House");
  await page.getByLabel("Family size").fill("3");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  // Diet is a multi-select chip set (OptionChips → role=button), not a radio.
  await page.getByRole("button", { name: "Vegetarian", exact: true }).click();
  await page.getByRole("button", { name: "North Indian", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // Step 3: three card-based modes (global criterion 7).
  const combinations = page.getByRole("button", {
    name: /select meal combinations/i,
  });
  const build = page.getByRole("button", {
    name: /build your own combination/i,
  });
  const system = page.getByRole("button", { name: /let the system decide/i });
  await expect(combinations).toBeVisible();
  await expect(build).toBeVisible();
  await expect(system).toBeVisible();

  // Each mode opens its own surface (asserted via entry points that don't depend
  // on seeded catalog rows).
  await combinations.click();
  await expect(page.getByLabel(/search meal combinations/i)).toBeVisible();

  await build.click();
  await expect(page.getByLabel(/search dishes/i)).toBeVisible();

  await system.click();
  await expect(page.getByText(/the planner will choose dishes/i)).toBeVisible();
});

// P10 shipped the combination catalog, build-your-own, promotion workflow, and
// admin review. These remain fixme pending deeper automation (and, for the
// catalog-card cases, the combination seed being applied to cloud dev):
test.fixme("MEALPREF-002: combination cards are exhaustive + popularity-sorted (needs seeded combination catalog + card assertions)", async () => {});
test.fixme("MEALPREF-003: build-your-own persists frequency + goes-with (needs BuildDishConfig assertions)", async () => {});
test.fixme("MEALPREF-004: user combinations promoted only after meal approval (needs approve-meal flow)", async () => {});
test.fixme("MEALPREF-005: 'let the system decide' uses popularity + frequency (needs combination-catalog assertions)", async () => {});
test.fixme("MEALPREF-006: recommended meals are complete combinations (see MEALCOMP-001)", async () => {});
test.fixme("MEALPREF-007: meal-combination preferences editable after onboarding (follow-up)", async () => {});
test.fixme("MEALPREF-008: admin can manage approved combinations (needs admin combination-review UI walkthrough)", async () => {});
test.fixme("MEALPREF-009: meal-preference UI passes visual QA (manual/visual review)", async () => {});
