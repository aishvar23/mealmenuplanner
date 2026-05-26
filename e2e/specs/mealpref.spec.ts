import { expect, test } from "../fixtures/auth";
import { signInWithPassword } from "../helpers/auth";

/**
 * MEALPREF — meal-preference onboarding. The app implements two of the spec's
 * three modes: "Choose my preferred dishes" (image-backed dish cards) and "Let
 * the system choose". The meal-COMBINATION catalog, build-your-own combinations,
 * frequency tags, and popularity-sorted combination cards (MEALPREF-002..008,
 * global criteria 7/9/10) are not wired into the app — those are fixmes.
 */

test("MEALPREF (implemented): preferred-dishes step offers manual + system modes with image-backed cards", async ({
  page,
  freshUser,
}) => {
  await signInWithPassword(page, freshUser.email, freshUser.password);
  await page.waitForURL("**/onboarding", { timeout: 30_000 });

  // Step 1 → 2: basics, then diet + cuisine.
  await page.getByLabel("Household name").fill("Pref House");
  await page.getByLabel("Family size").fill("3");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("radio", { name: "Vegetarian", exact: true }).click();
  await page.getByRole("button", { name: "North Indian", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // Step 3: preferred dishes — both modes present.
  await expect(
    page.getByRole("button", { name: /choose my preferred dishes/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /let the system choose/i }),
  ).toBeVisible();

  // Manual mode reveals searchable, image-backed dish cards (global criterion 8).
  await page
    .getByRole("button", { name: /choose my preferred dishes/i })
    .click();
  await expect(page.getByLabel(/search dishes/i)).toBeVisible();
  await expect(page.locator("img[alt]").first()).toBeAttached({
    timeout: 15_000,
  });
});

test.fixme("MEALPREF-001: three meal-preference modes (only 2 of 3 implemented; combination mode not built)", async () => {});
test.fixme("MEALPREF-002: existing meal combinations are card-based + popularity-sorted (combination catalog not wired into the app)", async () => {});
test.fixme("MEALPREF-003: build-your-own combination with frequency + goes-with (not implemented)", async () => {});
test.fixme("MEALPREF-004: user combinations promoted after approval (not implemented)", async () => {});
test.fixme("MEALPREF-005: 'let the system decide' uses popularity/frequency (frequency + combination popularity not implemented)", async () => {});
test.fixme("MEALPREF-006: recommended meals are complete combinations (see MEALCOMP-001)", async () => {});
test.fixme("MEALPREF-007: meal-combination preferences editable after onboarding (combination mode not built)", async () => {});
test.fixme("MEALPREF-008: admin can manage approved combinations (no admin combination UI)", async () => {});
test.fixme("MEALPREF-009: meal-preference UI passes visual QA (manual/visual review)", async () => {});
