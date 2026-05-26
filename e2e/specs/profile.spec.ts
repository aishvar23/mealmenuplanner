import { expect, test } from "@playwright/test";

import { OWNER_STORAGE_STATE } from "../fixtures/constants";

/**
 * PROFILE — the account button + menu on desktop and mobile, and reaching
 * household/preferences from it. Reuses the seeded owner session.
 */
test.use({ storageState: OWNER_STORAGE_STATE });

test("PROFILE-001: signed-in user sees a clickable profile button", async ({
  page,
}) => {
  await page.goto("/today");
  const account = page.getByRole("button", { name: /account menu/i }).first();
  await expect(account).toBeVisible();

  await account.click();
  // Menu reveals identity and the sign-out / preferences actions.
  await expect(page.getByText("owner@example.com").first()).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: /household.*preferences/i }),
  ).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /sign out/i })).toBeVisible();
});

test("PROFILE-003: user can reach household & preferences from the profile menu", async ({
  page,
}) => {
  await page.goto("/today");
  await page
    .getByRole("button", { name: /account menu/i })
    .first()
    .click();
  await page.getByRole("menuitem", { name: /household.*preferences/i }).click();
  await expect(page).toHaveURL(/\/household(\?|$|\/)/);
  await expect(
    page.getByRole("heading", { name: /household/i }).first(),
  ).toBeVisible();
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("PROFILE-002: profile button works on mobile", async ({ page }) => {
    await page.goto("/today");
    const account = page.getByRole("button", { name: /account menu/i }).first();
    await expect(account).toBeVisible();
    await account.click();
    await expect(
      page.getByRole("menuitem", { name: /sign out/i }),
    ).toBeVisible();
  });
});
