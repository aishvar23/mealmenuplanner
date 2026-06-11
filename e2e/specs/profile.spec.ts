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
  // Scope identity + action assertions to the open menu popup — the email also
  // appears in the trigger label and the sidebar, so a page-wide getByText is
  // ambiguous. The menu was restructured into discrete items (Preferences,
  // Members, Manage households, Notification settings); assert the stable
  // Preferences + Sign out entries.
  const menu = page.getByRole("menu");
  await expect(menu.getByText("owner@example.com")).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: /preferences/i }).first(),
  ).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /sign out/i })).toBeVisible();
});

test("PROFILE-003: user can reach household & preferences from the profile menu", async ({
  page,
}) => {
  await page.goto("/today");
  await page
    .getByRole("button", { name: /account menu/i })
    .first()
    .click();
  // The "Members" item navigates to the household page (the menu's household
  // entry point after the Preferences/Members/Manage-households split).
  await page.getByRole("menuitem", { name: /^members$/i }).click();
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
