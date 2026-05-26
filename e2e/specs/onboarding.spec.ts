import { expect, test } from "../fixtures/auth";
import { signInWithPassword } from "../helpers/auth";
import { completeMinimumOnboarding } from "../helpers/onboarding";

/**
 * ONBOARD-001 / ONBOARD-002 — a brand-new (no-household) user is routed into the
 * setup experience and can complete the minimum required onboarding. Uses the
 * `freshUser` fixture so each run starts clean and the created household is torn
 * down afterwards.
 */

test("ONBOARD-001: new signed-in user is prompted to set up a household", async ({
  page,
  freshUser,
}) => {
  await signInWithPassword(page, freshUser.email, freshUser.password);

  // A user with no household is sent to onboarding, not a broken empty dashboard.
  await page.waitForURL("**/onboarding", { timeout: 30_000 });
  await expect(page.getByLabel("Household name")).toBeVisible();
});

test("ONBOARD-002: user can complete minimum onboarding and generate a first suggestion", async ({
  page,
  freshUser,
}) => {
  await signInWithPassword(page, freshUser.email, freshUser.password);
  await page.waitForURL("**/onboarding", { timeout: 30_000 });

  await completeMinimumOnboarding(page, {
    householdName: "E2E Fresh Household",
  });

  // Lands on Today with the household created and the chosen meal slot planned.
  await expect(page).toHaveURL(/\/today(\?|$|\/)/);

  // First meal suggestion can be generated (acceptance criterion).
  await page
    .getByRole("button", { name: /suggest a meal/i })
    .first()
    .click();

  // A suggestion now exists: it can be approved or re-rolled.
  await expect(
    page.getByRole("button", { name: "Approve" }).first(),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByRole("button", { name: "Try another" }).first(),
  ).toBeVisible();
});
